import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { enrichTicketTypeWithActivePricing } from '../lib/checkoutPricing.js';

const router = Router();

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeNumeric(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validateSaleWindow(saleStartDate, saleEndDate) {
  const start = toDate(saleStartDate);
  const end = toDate(saleEndDate);

  if (saleStartDate && !start) {
    return 'Format sale_start_date tidak valid.';
  }

  if (saleEndDate && !end) {
    return 'Format sale_end_date tidak valid.';
  }

  if (start && end && start > end) {
    return 'Tanggal mulai jual tidak boleh melebihi tanggal selesai jual.';
  }

  return null;
}

async function canManageEvent(eventId, user) {
  if (user.role === 'SUPER_ADMIN') return true;

  const [rows] = await pool.query(
    `SELECT e.id
     FROM events e
     JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     WHERE e.id = ? AND ep.user_id = ?
     LIMIT 1`,
    [eventId, user.id]
  );

  return rows.length > 0;
}

async function canManageTicketType(ticketTypeId, user) {
  if (user.role === 'SUPER_ADMIN') return true;

  const [rows] = await pool.query(
    `SELECT tt.id
     FROM ticket_types tt
     JOIN events e ON e.id = tt.event_id
     JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     WHERE tt.id = ? AND ep.user_id = ?
     LIMIT 1`,
    [ticketTypeId, user.id]
  );

  return rows.length > 0;
}

async function hasPaidSales(ticketTypeId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.ticket_type_id = ?
       AND o.status = 'PAID'`,
    [ticketTypeId]
  );

  return Number(rows[0]?.total || 0) > 0;
}

async function hasIssuedTickets(ticketTypeId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM tickets
     WHERE ticket_type_id = ?`,
    [ticketTypeId]
  );

  return Number(rows[0]?.total || 0) > 0;
}

// GET /api/ticket-types
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM ticket_types';
    const params = [];
    if (req.query.event_id) {
      query += ' WHERE event_id = ?';
      params.push(req.query.event_id);
    }
    const [rows] = await pool.query(query, params);

    const enrichedRows = [];
    for (const row of rows) {
      const enriched = await enrichTicketTypeWithActivePricing(pool, row, new Date());
      enrichedRows.push(enriched);
    }

    res.json(enrichedRows);
  } catch (err) {
    console.error('[ticketTypes/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/ticket-types/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ticket_types WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket type tidak ditemukan' });
    const enriched = await enrichTicketTypeWithActivePricing(pool, rows[0], new Date());
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/ticket-types
router.post('/', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const {
      id,
      event_id,
      name,
      description,
      price,
      quota,
      sold,
      max_per_order,
      max_per_account,
      sale_start_date,
      sale_end_date,
      is_bundle,
      bundle_qty,
    } = req.body;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id wajib diisi.' });
    }
    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'Nama tiket wajib diisi.' });
    }

    const canManage = await canManageEvent(event_id, req.user);
    if (!canManage) {
      return res.status(403).json({ error: 'Akses ditolak untuk event ini.' });
    }

    const ttId = id || `tt_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;

    const normalizedPrice = normalizeNumeric(price, 0);
    const normalizedQuota = Math.max(1, Math.trunc(normalizeNumeric(quota, 100)));
    const normalizedSold = Math.max(0, Math.trunc(normalizeNumeric(sold, 0)));
    const normalizedMaxPerOrder = Math.max(1, Math.trunc(normalizeNumeric(max_per_order, 5)));
    const normalizedMaxPerAccount = Math.max(0, Math.trunc(normalizeNumeric(max_per_account, 0)));

    if (normalizedSold > normalizedQuota) {
      return res.status(400).json({ error: 'Nilai sold tidak boleh melebihi quota.' });
    }

    if (normalizedPrice < 0) {
      return res.status(400).json({ error: 'Harga tiket tidak boleh negatif.' });
    }

    const bundleEnabled = Number(is_bundle || 0) === 1;
    const normalizedBundleQty = bundleEnabled
      ? Math.max(2, Math.min(10, Number(bundle_qty || 2)))
      : 1;

    if (bundleEnabled && (!Number.isInteger(Number(bundle_qty || 0)) || Number(bundle_qty) < 2 || Number(bundle_qty) > 10)) {
      return res.status(400).json({ error: 'bundle_qty wajib bilangan bulat antara 2 sampai 10.' });
    }

    const saleWindowError = validateSaleWindow(sale_start_date, sale_end_date);
    if (saleWindowError) {
      return res.status(400).json({ error: saleWindowError });
    }

    await pool.query(
      `INSERT INTO ticket_types (
        id, event_id, name, description, price, quota, sold,
        max_per_order, max_per_account, sale_start_date, sale_end_date,
        is_bundle, bundle_qty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ttId,
        event_id,
        String(name).trim(),
        description || null,
        normalizedPrice,
        normalizedQuota,
        normalizedSold,
        normalizedMaxPerOrder,
        normalizedMaxPerAccount,
        sale_start_date || null,
        sale_end_date || null,
        bundleEnabled ? 1 : 0,
        normalizedBundleQty,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM ticket_types WHERE id = ?', [ttId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[ticketTypes/create]', err);
    res.status(500).json({ error: 'Gagal membuat ticket type' });
  }
});

// PUT /api/ticket-types/:id
router.put('/:id', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const fields = [];
    const values = [];
    const allowed = [
      'name',
      'description',
      'price',
      'quota',
      'sold',
      'max_per_order',
      'max_per_account',
      'sale_start_date',
      'sale_end_date',
      'is_bundle',
      'bundle_qty',
    ];

    const [currentRows] = await pool.query('SELECT * FROM ticket_types WHERE id = ?', [req.params.id]);
    if (!currentRows.length) return res.status(404).json({ error: 'Ticket type tidak ditemukan' });
    const current = currentRows[0];

    const canManage = await canManageTicketType(req.params.id, req.user);
    if (!canManage) {
      return res.status(403).json({ error: 'Akses ditolak untuk ticket type ini.' });
    }

    const paidSalesExist = await hasPaidSales(req.params.id);

    if (
      paidSalesExist &&
      (
        req.body.is_bundle !== undefined ||
        req.body.bundle_qty !== undefined
      )
    ) {
      return res.status(400).json({
        error: 'Konfigurasi bundling tidak bisa diubah karena tiket sudah pernah terjual.',
      });
    }

    let nextIsBundle = req.body.is_bundle;
    if (nextIsBundle === undefined && req.body.bundle_qty !== undefined) {
      nextIsBundle = current.is_bundle;
    }

    if (req.body.is_bundle !== undefined && Number(req.body.is_bundle || 0) === 1 && req.body.bundle_qty === undefined) {
      req.body.bundle_qty = Math.max(2, Number(current.bundle_qty || 2));
    }

    if (req.body.bundle_qty !== undefined) {
      const parsedBundleQty = Number(req.body.bundle_qty);
      const bundleEnabled = Number(nextIsBundle || 0) === 1;
      if (bundleEnabled && (!Number.isInteger(parsedBundleQty) || parsedBundleQty < 2 || parsedBundleQty > 10)) {
        return res.status(400).json({ error: 'bundle_qty wajib bilangan bulat antara 2 sampai 10.' });
      }
      if (!bundleEnabled) {
        req.body.bundle_qty = 1;
      }
    }

    if (req.body.is_bundle !== undefined && Number(req.body.is_bundle || 0) === 0) {
      req.body.bundle_qty = 1;
    }

    if (req.body.name !== undefined && !String(req.body.name || '').trim()) {
      return res.status(400).json({ error: 'Nama tiket wajib diisi.' });
    }

    if (req.body.price !== undefined) {
      const normalizedPrice = normalizeNumeric(req.body.price, NaN);
      if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
        return res.status(400).json({ error: 'Harga tiket tidak valid.' });
      }
      req.body.price = normalizedPrice;
    }

    if (req.body.quota !== undefined) {
      const normalizedQuota = Math.max(1, Math.trunc(normalizeNumeric(req.body.quota, NaN)));
      if (!Number.isFinite(normalizedQuota)) {
        return res.status(400).json({ error: 'Kuota tiket tidak valid.' });
      }
      if (normalizedQuota < Number(current.sold || 0)) {
        return res.status(400).json({ error: 'Kuota tidak boleh lebih kecil dari jumlah tiket terjual.' });
      }
      req.body.quota = normalizedQuota;
    }

    if (req.body.max_per_order !== undefined) {
      const normalized = Math.max(1, Math.trunc(normalizeNumeric(req.body.max_per_order, NaN)));
      if (!Number.isFinite(normalized)) {
        return res.status(400).json({ error: 'Batas per transaksi tidak valid.' });
      }
      req.body.max_per_order = normalized;
    }

    if (req.body.max_per_account !== undefined) {
      const normalized = Math.max(0, Math.trunc(normalizeNumeric(req.body.max_per_account, NaN)));
      if (!Number.isFinite(normalized)) {
        return res.status(400).json({ error: 'Batas per akun tidak valid.' });
      }
      req.body.max_per_account = normalized;
    }

    if (req.body.sale_start_date === '') req.body.sale_start_date = null;
    if (req.body.sale_end_date === '') req.body.sale_end_date = null;

    const nextSaleStart = req.body.sale_start_date !== undefined
      ? req.body.sale_start_date
      : current.sale_start_date;
    const nextSaleEnd = req.body.sale_end_date !== undefined
      ? req.body.sale_end_date
      : current.sale_end_date;
    const saleWindowError = validateSaleWindow(nextSaleStart, nextSaleEnd);
    if (saleWindowError) {
      return res.status(400).json({ error: saleWindowError });
    }

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        if (key === 'name') {
          values.push(String(req.body[key]).trim());
        } else {
          values.push(req.body[key]);
        }
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    values.push(req.params.id);

    await pool.query(`UPDATE ticket_types SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM ticket_types WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('[ticketTypes/update]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/ticket-types/:id
router.delete('/:id', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const ticketTypeId = req.params.id;

    const [rows] = await pool.query('SELECT id FROM ticket_types WHERE id = ?', [ticketTypeId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Ticket type tidak ditemukan' });
    }

    const canManage = await canManageTicketType(ticketTypeId, req.user);
    if (!canManage) {
      return res.status(403).json({ error: 'Akses ditolak untuk ticket type ini.' });
    }

    const paidSalesExist = await hasPaidSales(ticketTypeId);
    const issuedTicketExist = await hasIssuedTickets(ticketTypeId);
    if (paidSalesExist || issuedTicketExist) {
      return res.status(400).json({
        error: 'Jenis tiket tidak bisa dihapus karena sudah memiliki penjualan atau tiket terbit.',
      });
    }

    await pool.query('DELETE FROM ticket_pricing_phases WHERE ticket_type_id = ?', [ticketTypeId]);
    await pool.query('DELETE FROM ticket_types WHERE id = ?', [ticketTypeId]);

    res.json({ success: true });
  } catch (err) {
    console.error('[ticketTypes/delete]', err);
    res.status(500).json({ error: 'Gagal menghapus ticket type' });
  }
});

export default router;
