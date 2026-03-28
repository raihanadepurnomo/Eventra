import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireVerifiedEmail } from '../middleware/auth.js';
import { sendOrderExpiredEmail, sendPaymentSuccessEmail } from '../lib/transactionalEmails.js';

const router = Router();

function toDbDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function asBadRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// GET /api/orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT DISTINCT o.* FROM orders o';
    const params = [];
    const conditions = [];

    // Filter by eo_profile_id (accessible by the EO or Super Admin)
    if (req.query.eo_profile_id) {
      query += `
        JOIN order_items oi ON o.id = oi.order_id
        JOIN ticket_types tt ON oi.ticket_type_id = tt.id
        JOIN events e ON tt.event_id = e.id
      `;
      conditions.push('e.eo_profile_id = ?');
      params.push(req.query.eo_profile_id);
    }

    // Filter by user_id
    if (req.query.user_id) {
      conditions.push('o.user_id = ?');
      params.push(req.query.user_id);
    } else if (req.user.role !== 'SUPER_ADMIN' && !req.query.eo_profile_id) {
      // Regular users can only see their own orders unless an EO is looking at their own event stats
      conditions.push('o.user_id = ?');
      params.push(req.user.id);
    }

    // Filter by status
    if (req.query.status) {
      conditions.push('o.status = ?');
      params.push(req.query.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY o.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[orders/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/orders/expire
router.post('/expire', async (req, res) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [expiredOrders] = await pool.query(
      `SELECT id FROM orders WHERE status = 'PENDING' AND expired_at < ?`,
      [now]
    );

    if (expiredOrders.length > 0) {
      const orderIds = expiredOrders.map(o => o.id);
      const [items] = await pool.query(
        `SELECT ticket_type_id, quantity FROM order_items WHERE order_id IN (?)`,
        [orderIds]
      );

      for (const item of items) {
        await pool.query(
          'UPDATE ticket_types SET sold = GREATEST(0, sold - ?) WHERE id = ?',
          [item.quantity, item.ticket_type_id]
        );
      }

      await pool.query(
        `UPDATE orders SET status = 'EXPIRED' WHERE id IN (?)`,
        [orderIds]
      );

      for (const order of expiredOrders) {
        await sendOrderExpiredEmail(pool, order.id, 'expired');
      }
    }
    
    res.json({ expired: expiredOrders.length });
  } catch (err) {
    console.error('[orders/expire]', err);
    res.status(500).json({ error: 'Failed to expire orders' });
  }
});

// GET /api/orders/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    
    // 1. Check regular orders
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length > 0) return res.json(orders[0]);
    
    // 2. Check resale orders if not found in regular orders (or if ID prefix matches)
    if (id.startsWith('rord_')) {
      const [resaleOrders] = await pool.query(
        'SELECT *, buyer_id as user_id, total_paid as total_amount FROM resale_orders WHERE id = ?', 
        [id]
      );
      if (resaleOrders.length > 0) return res.json(resaleOrders[0]);
    }
    
    res.status(404).json({ error: 'Order tidak ditemukan' });
  } catch (err) {
    console.error('[orders/get-detail]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/orders
router.post('/', authenticateToken, requireVerifiedEmail, async (req, res) => {
  let conn;
  try {
    const { id, expired_at, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Item pesanan tidak boleh kosong' });
    }

    const orderId = id || `ord_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const now = toDbDateTime();

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const normalizedItems = [];
    let grandTotal = 0;

    for (const item of items) {
      const ticketTypeId = item.ticket_type_id;
      const quantity = Number(item.quantity);

      if (!ticketTypeId) {
        throw asBadRequest('ticket_type_id wajib diisi');
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw asBadRequest('Quantity tiket harus bilangan bulat lebih dari 0');
      }
      if (normalizedItems.some((normalizedItem) => normalizedItem.ticketTypeId === ticketTypeId)) {
        throw asBadRequest('Satu jenis tiket hanya boleh muncul sekali dalam pesanan');
      }

      const [ticketRows] = await conn.query(
        `SELECT id, name, price, quota, sold, max_per_order, max_per_account
         FROM ticket_types
         WHERE id = ?
         FOR UPDATE`,
        [ticketTypeId]
      );

      if (ticketRows.length === 0) {
        throw asBadRequest(`Jenis tiket ${ticketTypeId} tidak ditemukan`);
      }

      const ticketType = ticketRows[0];
      const maxPerOrder = Number(ticketType.max_per_order || 0);
      const maxPerAccount = Number(ticketType.max_per_account || 0);
      const sold = Number(ticketType.sold || 0);
      const quota = Number(ticketType.quota || 0);

      if (maxPerOrder > 0 && quantity > maxPerOrder) {
        throw asBadRequest(`Maksimal pembelian untuk tiket ${ticketType.name} adalah ${maxPerOrder} tiket per transaksi.`);
      }

      const remainingQuota = quota - sold;
      if (quantity > remainingQuota) {
        throw asBadRequest(`Kuota tiket ${ticketType.name} tidak mencukupi. Sisa kuota ${Math.max(0, remainingQuota)} tiket.`);
      }

      if (maxPerAccount > 0) {
        const [ownedRows] = await conn.query(
          `SELECT COALESCE(SUM(t.quantity), 0) AS total_owned
           FROM tickets t
           JOIN orders o ON o.id = t.order_id
           WHERE t.ticket_type_id = ?
             AND t.user_id = ?
             AND o.status = 'PAID'
             AND t.status NOT IN ('CANCELLED', 'TRANSFERRED')`,
          [ticketTypeId, req.user.id]
        );

        const totalOwned = Number(ownedRows[0]?.total_owned || 0);
        const totalAfterPurchase = totalOwned + quantity;

        if (totalAfterPurchase > maxPerAccount) {
          const remainingAllowed = Math.max(0, maxPerAccount - totalOwned);
          throw asBadRequest(
            `Batas pembelian untuk tiket ${ticketType.name} adalah ${maxPerAccount} tiket per akun. ` +
            `Kamu sudah memiliki ${totalOwned} tiket. Kamu hanya bisa membeli ${remainingAllowed} tiket lagi.`
          );
        }
      }

      const attendeeJson = item.attendee_details
        ? (typeof item.attendee_details === 'string' ? item.attendee_details : JSON.stringify(item.attendee_details))
        : null;
      const unitPrice = Number(ticketType.price || 0);
      const subtotal = unitPrice * quantity;

      grandTotal += subtotal;
      normalizedItems.push({
        id: `oi_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`,
        ticketTypeId,
        quantity,
        unitPrice,
        subtotal,
        attendeeJson,
      });
    }

    const isFreeOrder = grandTotal === 0;
    const orderStatus = isFreeOrder ? 'PAID' : 'PENDING';
    const paidAt = isFreeOrder ? now : null;
    const expiredAt = isFreeOrder ? null : (expired_at || null);

    await conn.query(
      `INSERT INTO orders (id, user_id, total_amount, status, expired_at, created_at, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, req.user.id, grandTotal, orderStatus, expiredAt, now, paidAt]
    );

    for (const item of normalizedItems) {
      await conn.query(
        `INSERT INTO order_items (id, order_id, ticket_type_id, quantity, unit_price, subtotal, attendee_details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [item.id, orderId, item.ticketTypeId, item.quantity, item.unitPrice, item.subtotal, item.attendeeJson]
      );

      await conn.query(
        'UPDATE ticket_types SET sold = sold + ? WHERE id = ?',
        [item.quantity, item.ticketTypeId]
      );

      if (isFreeOrder) {
        const ticketId = `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`;
        const qrCode = `qr_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
        await conn.query(
          `INSERT INTO tickets (id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at, quantity, attendee_details, order_item_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ticketId, orderId, req.user.id, item.ticketTypeId, qrCode, 'ACTIVE', 0, now, item.quantity, item.attendeeJson, item.id]
        );
      }
    }

    await conn.commit();

    if (isFreeOrder) {
      await sendPaymentSuccessEmail(pool, orderId, 'free_ticket');
    }

    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    res.status(201).json({ ...rows[0], is_free: isFreeOrder });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('[orders/create] rollback failed', rollbackErr);
      }
    }
    console.error('[orders/create]', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Gagal membuat order' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/orders/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const fields = [];
    const values = [];
    const allowed = ['status', 'payment_method', 'payment_token', 'paid_at'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    values.push(req.params.id);

    await pool.query(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
