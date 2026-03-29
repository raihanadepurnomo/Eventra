import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireVerifiedEmail } from '../middleware/auth.js';
import midtransClient from 'midtrans-client';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  sendResalePaymentSuccessEmail,
  sendResalePendingPaymentEmail,
  sendResaleOrderExpiredEmail,
  sendResaleListingPublishedEmail,
  sendResaleListingSoldEmail,
  sendResaleListingExpiredEmail,
} from '../lib/transactionalEmails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
let sellerBalanceTransactionsTableEnsured = false;

const BALANCE_TX_TYPES = {
  RESALE_SOLD: 'RESALE_SOLD',
  LISTING_EXPIRED_COMPENSATION: 'LISTING_EXPIRED_COMPENSATION',
};

async function ensureSellerBalanceTransactionsTable() {
  if (sellerBalanceTransactionsTableEnsured) return;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS seller_balance_transactions (
      id varchar(50) NOT NULL,
      seller_balance_id varchar(50) NOT NULL,
      user_id varchar(50) NOT NULL,
      type varchar(60) NOT NULL,
      amount int(11) NOT NULL DEFAULT 0,
      description varchar(255) DEFAULT NULL,
      reference_id varchar(100) DEFAULT NULL,
      created_at datetime DEFAULT current_timestamp(),
      PRIMARY KEY (id),
      KEY idx_seller_balance_transactions_user (user_id),
      KEY idx_seller_balance_transactions_created (created_at),
      UNIQUE KEY uq_seller_balance_transactions_ref (user_id, type, reference_id),
      KEY idx_seller_balance_transactions_balance (seller_balance_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );

  sellerBalanceTransactionsTableEnsured = true;
}

async function getOrCreateSellerBalanceForUpdate(conn, userId) {
  const [rows] = await conn.query(
    `SELECT * FROM seller_balances WHERE user_id = ? FOR UPDATE`,
    [userId]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  const id = `bal_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
  await conn.query(
    `INSERT INTO seller_balances (id, user_id, balance, total_earned)
     VALUES (?, ?, 0, 0)`,
    [id, userId]
  );

  const [createdRows] = await conn.query(
    `SELECT * FROM seller_balances WHERE id = ? LIMIT 1`,
    [id]
  );

  return createdRows[0] || { id, user_id: userId, balance: 0, total_earned: 0 };
}

async function creditSellerBalanceWithHistory(conn, {
  userId,
  amount,
  type,
  referenceId,
  description,
}) {
  const normalizedAmount = Math.max(0, Number(amount || 0));
  if (!userId || !type || !referenceId || normalizedAmount <= 0) {
    return false;
  }

  const [existingRows] = await conn.query(
    `SELECT id FROM seller_balance_transactions
     WHERE user_id = ? AND type = ? AND reference_id = ?
     LIMIT 1`,
    [userId, type, referenceId]
  );
  if (existingRows.length > 0) {
    return false;
  }

  const balance = await getOrCreateSellerBalanceForUpdate(conn, userId);

  await conn.query(
    `UPDATE seller_balances
     SET balance = balance + ?,
         total_earned = total_earned + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [normalizedAmount, normalizedAmount, balance.id]
  );

  const txId = `sbtx_${crypto.randomUUID().replace(/-/g, '').substring(0, 10)}`;
  await conn.query(
    `INSERT INTO seller_balance_transactions
      (id, seller_balance_id, user_id, type, amount, description, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      txId,
      balance.id,
      userId,
      type,
      normalizedAmount,
      description || null,
      referenceId,
    ]
  );

  return true;
}

// Configure multer for payout receipts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Correct absolute path to public/receipts (2 levels up from server/routes)
    const uploadPath = path.join(__dirname, '..', '..', 'public', 'receipts');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const { account_name } = req.body;
    const cleanName = (account_name || 'receipt').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${cleanName}_${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// Lazy Expiration Helper
export async function checkEscrowExpiration() {
    await ensureSellerBalanceTransactionsTable();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  // 1. Expire Listings (7 days)
  const [expiredListings] = await pool.query(
    `SELECT id, ticket_id, seller_id, original_price, asking_price
     FROM resale_listings
     WHERE status = 'OPEN' AND expired_at < ?`,
    [now]
  );
  
  if (expiredListings.length > 0) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const listing of expiredListings) {
        await conn.query(
          `UPDATE resale_listings
           SET status = 'EXPIRED'
           WHERE id = ? AND status = 'OPEN'`,
          [listing.id]
        );

        await conn.query(
          `UPDATE tickets
           SET status = 'CANCELLED', is_used = 1
           WHERE id = ?`,
          [listing.ticket_id]
        );

        const compensationAmount = Math.max(0, Number(listing.original_price || 0));
        if (compensationAmount > 0) {
          await creditSellerBalanceWithHistory(conn, {
            userId: listing.seller_id,
            amount: compensationAmount,
            type: BALANCE_TX_TYPES.LISTING_EXPIRED_COMPENSATION,
            referenceId: listing.id,
            description: 'Kompensasi listing resale expired',
          });
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    for (const listing of expiredListings) {
      try {
        await sendResaleListingExpiredEmail(pool, listing.id, 'expired');
      } catch (mailErr) {
        console.error('[resale/expire-listing][email]', listing.id, mailErr?.message || mailErr);
      }
    }
  }

  // 2. Expire Orders (15 minutes)
  const [expiredOrders] = await pool.query(
    `SELECT id, resale_listing_id FROM resale_orders WHERE status = 'PENDING' AND expired_at < ?`,
    [now]
  );

  if (expiredOrders.length > 0) {
    const ids = expiredOrders.map(o => o.id);
    await pool.query(`UPDATE resale_orders SET status = 'EXPIRED' WHERE id IN (?)`, [ids]);

    for (const order of expiredOrders) {
      try {
        await sendResaleOrderExpiredEmail(pool, order.id, 'expired');
      } catch (mailErr) {
        console.error('[resale/expire-order][email]', order.id, mailErr?.message || mailErr);
      }
    }
  }
}

// GET /api/resale/listings
router.get('/listings', async (req, res) => {
  try {
    await checkEscrowExpiration();
    const { event_id } = req.query;

    let query = `
      SELECT 
        rl.*,
        t.ticket_type_id,
        tt.name as ticket_type_name,
        e.title as event_title,
        u.name as seller_name,
        u.username as seller_username,
        u.image as seller_avatar
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON tt.event_id = e.id
      JOIN users u ON rl.seller_id = u.id
      WHERE rl.status = 'OPEN'
    `;
    const params = [];

    if (event_id) {
      query += ` AND e.id = ?`;
      params.push(event_id);
    }

    query += ` ORDER BY rl.asking_price ASC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[resale/listings/list] Error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar resale' });
  }
});

// POST /api/resale/listings
router.post('/listings', authenticateToken, requireVerifiedEmail, async (req, res) => {
  try {
    const { ticket_id, asking_price, note } = req.body;
    
    if (!ticket_id || !asking_price) {
      return res.status(400).json({ error: 'Data tidak lengkap. Pastikan ticket_id dan harga jual sudah diisi.' });
    }

    // 1. Validasi Tiket
    const [tickets] = await pool.query(
      `SELECT t.*, tt.price as original_price, tt.sale_end_date, tt.is_bundle, e.start_date, e.is_resale_allowed
       FROM tickets t
       JOIN ticket_types tt ON t.ticket_type_id = tt.id
       JOIN events e ON tt.event_id = e.id
       WHERE t.id = ? AND t.user_id = ?`,
      [ticket_id, req.user.id]
    );

    if (tickets.length === 0) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    const ticket = tickets[0];
    
    // Validasi apakah EO mengizinkan resale untuk event ini
    if (!ticket.is_resale_allowed) {
      return res.status(403).json({ error: 'EO tidak mengizinkan resale untuk event ini' });
    }

    if (Number(ticket.is_bundle || 0) === 1 || Number(ticket.bundle_total || 1) > 1) {
      return res.status(400).json({ error: 'Tiket bundling tidak dapat dijual kembali.' });
    }

    if (Number(ticket.quantity || 1) > 1) {
      return res.status(400).json({ error: 'Tiket ini masih format multi-qty lama. Buka ulang dashboard agar tiket dipisah otomatis, lalu pilih tiket yang ingin dijual.' });
    }

    if (String(ticket.order_id || '').startsWith('rord_')) {
      return res.status(400).json({ error: 'Tiket hasil resale tidak dapat diperjualbelikan lagi.' });
    }

    if (ticket.status !== 'ACTIVE') return res.status(400).json({ error: 'Tiket harus berstatus ACTIVE' });
    
    const now = new Date();
    if (new Date(ticket.start_date) <= now) {
      return res.status(400).json({ error: 'Event sudah dimulai atau berlalu' });
    }

    // 2. Cek listing aktif
    const [existing] = await pool.query(
      `SELECT id FROM resale_listings WHERE ticket_id = ? AND status = 'OPEN'`,
      [ticket_id]
    );
    if (existing.length > 0) return res.status(400).json({ error: 'Tiket sudah terdaftar untuk dijual' });

    // 3. Kalkulasi harga & fee
    const originalPrice = ticket.original_price;
    const maxPrice = Math.round(originalPrice * 1.2);
    const minPrice = Math.round(originalPrice * 0.5);

    if (asking_price > maxPrice) return res.status(400).json({ error: `Harga maksimal adalah Rp ${maxPrice.toLocaleString()}` });
    if (asking_price < minPrice) return res.status(400).json({ error: `Harga minimal adalah Rp ${minPrice.toLocaleString()}` });

    const platformFee = Math.round(asking_price * 0.05);
    const sellerReceives = asking_price - platformFee;
    
    // Set expiration to ticket type sale end date, fallback to 7 days if not possible
    let expiredAtDate = ticket.sale_end_date ? new Date(ticket.sale_end_date) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // Safety check: if sale_end_date is invalid or in the past, use a fallback
    if (isNaN(expiredAtDate.getTime()) || expiredAtDate <= now) {
      expiredAtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    
    const id = `rl_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    
    await pool.query(
      `INSERT INTO resale_listings 
       (id, ticket_id, seller_id, original_price, asking_price, max_allowed_price, platform_fee, seller_receives, note, status, expired_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, ticket_id, req.user.id, originalPrice, Number(asking_price), maxPrice, platformFee, sellerReceives, note || null, expiredAtDate]
    );

    // 5. Update Ticket Status
    await pool.query(`UPDATE tickets SET status = 'LISTED_FOR_RESALE' WHERE id = ?`, [ticket_id]);

    try {
      await sendResaleListingPublishedEmail(pool, id);
    } catch (mailErr) {
      console.error('[resale/listing-published][email]', id, mailErr?.message || mailErr);
    }

    res.status(201).json({ id, status: 'OPEN' });
  } catch (err) {
    console.error('[resale/listings/create]', err);
    res.status(500).json({ error: 'Gagal membuat listing' });
  }
});

// DELETE /api/resale/listings/:listingId
router.delete('/listings/:id', authenticateToken, async (req, res) => {
  try {
    const [listings] = await pool.query(`SELECT * FROM resale_listings WHERE id = ?`, [req.params.id]);
    if (listings.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
    const listing = listings[0];

    if (listing.seller_id !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (listing.status !== 'OPEN') return res.status(400).json({ error: 'Listing tidak bisa dibatalkan' });

    await pool.query(`UPDATE resale_listings SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    await pool.query(`UPDATE tickets SET status = 'ACTIVE' WHERE id = ?`, [listing.ticket_id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[resale/listings/delete] Error:', err);
    res.status(500).json({ error: 'Gagal menghapus listing' });
  }
});

// POST /api/resale/listings/:listingId/buy
router.post('/listings/:id/buy', authenticateToken, requireVerifiedEmail, async (req, res) => {
  try {
    const [listings] = await pool.query(`SELECT * FROM resale_listings WHERE id = ? AND status = 'OPEN'`, [req.params.id]);
    if (listings.length === 0) return res.status(404).json({ error: 'Listing tidak tersedia' });
    const listing = listings[0];

    const { attendee_details } = req.body;
    if (!attendee_details) return res.status(400).json({ error: 'Data peserta harus diisi' });

    if (listing.seller_id === req.user.id) {
      return res.status(400).json({ error: 'Tidak bisa membeli tiket sendiri' });
    }

    const orderId = `rord_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 menit
    
    let attendeeInfo;
    try {
      attendeeInfo = typeof attendee_details === 'string' ? JSON.parse(attendee_details) : attendee_details;
    } catch { attendeeInfo = attendee_details; }
    
    const primaryAttendee = Array.isArray(attendeeInfo) ? (attendeeInfo[0]?.name ? attendeeInfo[0] : (typeof attendeeInfo[0] === 'object' ? attendeeInfo[0] : null)) : attendeeInfo;
    const attendeeJson = typeof attendee_details === 'string' ? attendee_details : JSON.stringify(attendee_details);
    
    const customerName = primaryAttendee?.name?.trim() || req.user.name || 'Customer';
    console.log(`[Midtrans/Resale] Order ${orderId} -> Customer: ${customerName}`);
    await pool.query(
      `INSERT INTO resale_orders 
       (id, resale_listing_id, buyer_id, total_paid, platform_fee, seller_receives, attendee_details, status, expired_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [orderId, listing.id, req.user.id, listing.asking_price, listing.platform_fee, listing.seller_receives, attendeeJson, expiredAt]
    );

    // Midtrans
    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      serverKey: process.env.MIDTRANS_SERVER_KEY?.replace(/['"]/g, ''),
      clientKey: process.env.MIDTRANS_CLIENT_KEY?.replace(/['"]/g, '')
    });

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: listing.asking_price
      },
      customer_details: {
        first_name: customerName,
        email: primaryAttendee?.email || req.user.email
      },
      item_details: [{
        id: listing.id,
        price: listing.asking_price,
        quantity: 1,
        name: 'Resale Ticket'
      }],
      callbacks: {
        finish: 'http://localhost:3000/dashboard',
        error: 'http://localhost:3000/dashboard',
        pending: 'http://localhost:3000/dashboard'
      }
    };

    const transaction = await snap.createTransaction(parameter);
    await pool.query(`UPDATE resale_orders SET payment_token = ?, midtrans_order_id = ? WHERE id = ?`, [transaction.token, orderId, orderId]);

    res.json({ snapToken: transaction.token, resaleOrderId: orderId });
  } catch (err) {
    console.error('[resale/buy]', err);
    res.status(500).json({ error: 'Gagal inisiasi pembayaran' });
  }
});

// GET /api/resale/orders
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT ro.*, rl.asking_price, rl.platform_fee, rl.seller_receives
      FROM resale_orders ro
      JOIN resale_listings rl ON ro.resale_listing_id = rl.id
    `;
    const params = [];

    if (req.query.buyer_id) {
      query += ' WHERE ro.buyer_id = ?';
      params.push(req.query.buyer_id);
    } else if (req.user.role !== 'SUPER_ADMIN') {
      query += ' WHERE ro.buyer_id = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY ro.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[resale/orders/list] Error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar pesanan' });
  }
});

// GET /api/resale/orders/:id
router.get('/orders/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ro.*, rl.id as listing_id, e.title as event_title, tt.name as ticket_type_name
      FROM resale_orders ro
      JOIN resale_listings rl ON ro.resale_listing_id = rl.id
      JOIN tickets t ON rl.ticket_id = t.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON tt.event_id = e.id
      WHERE ro.id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    
    // Permission check
    if (rows[0].buyer_id !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Format for frontend
    const order = rows[0];
    res.json({
      ...order,
      listing: {
        event_title: order.event_title,
        ticket_type_name: order.ticket_type_name
      }
    });
  } catch (err) {
    console.error('[resale/orders/detail] Error:', err);
    res.status(500).json({ error: 'Gagal memuat detail pesanan' });
  }
});

// GET /api/resale/balance
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM seller_balances WHERE user_id = ?`, [req.user.id]);
    if (rows.length === 0) {
      // Create if doesn't exist
      const id = `bal_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
      await pool.query(`INSERT INTO seller_balances (id, user_id, balance, total_earned) VALUES (?, ?, 0, 0)`, [id, req.user.id]);
      return res.json({ balance: 0, total_earned: 0, total_withdrawn: 0 });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[resale/balance/get] Error:', err);
    res.status(500).json({ error: 'Gagal memuat saldo' });
  }
});

// GET /api/resale/balance/history
router.get('/balance/history', authenticateToken, async (req, res) => {
  try {
    await ensureSellerBalanceTransactionsTable();
    const [rows] = await pool.query(
      `SELECT *
       FROM seller_balance_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[resale/balance/history]', err);
    res.status(500).json({ error: 'Gagal memuat riwayat saldo' });
  }
});

// POST /api/resale/balance/withdraw
router.post('/balance/withdraw', authenticateToken, requireVerifiedEmail, async (req, res) => {
  try {
    const { amount, bank_name, account_number, account_name } = req.body;

    if (amount < 50000) return res.status(400).json({ error: 'Minimal pencairan Rp 50.000' });

    const [balances] = await pool.query(`SELECT * FROM seller_balances WHERE user_id = ?`, [req.user.id]);
    const balance = balances[0];

    if (!balance || balance.balance < amount) {
      return res.status(400).json({ error: 'Saldo tidak mencukupi' });
    }

    // Cek pending withdrawal
    const [pending] = await pool.query(`SELECT id FROM withdrawals WHERE user_id = ? AND status IN ('PENDING', 'PROCESSING')`, [req.user.id]);
    if (pending.length > 0) return res.status(400).json({ error: 'Masih ada permintaan pencairan yang sedang diproses' });

    const wdId = `wd_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    
    // Transactional update
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE seller_balances SET balance = balance - ?, total_withdrawn = total_withdrawn + ? WHERE id = ?`,
        [amount, amount, balance.id]
      );

      await connection.query(
        `INSERT INTO withdrawals (id, seller_balance_id, user_id, amount, bank_name, account_number, account_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [wdId, balance.id, req.user.id, amount, bank_name, account_number, account_name]
      );

      await connection.commit();
      res.json({ success: true, id: wdId });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('[resale/withdraw]', err);
    res.status(500).json({ error: 'Gagal mengajukan pencairan' });
  }
});

// Processing logic for resale payments (shared between webhook & check status)
export async function handleResalePaymentStatus(
  order_id,
  transaction_status,
  fraud_status,
  payment_method = null,
  midtransData = null
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let shouldSendSuccessEmail = false;
    let shouldSendPendingEmail = false;
    let shouldSendExpiredEmail = false;
    let expiredReason = 'expired';

    // 1. Find resale order with row lock
    const [resaleOrders] = await connection.query(`SELECT * FROM resale_orders WHERE id = ? FOR UPDATE`, [order_id]);
    if (resaleOrders.length === 0) {
      await connection.rollback();
      return { error: 'Order not found' };
    }
    const rOrder = resaleOrders[0];

    // If already paid, just return success
    if (rOrder.status === 'PAID') {
      await connection.rollback();
      return { status: 'PAID' };
    }

    let newStatus = rOrder.status;
    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      if (!fraud_status || fraud_status === 'accept') newStatus = 'PAID';
    } else if (['cancel', 'deny', 'expire'].includes(transaction_status)) {
      newStatus = transaction_status === 'expire' ? 'EXPIRED' : 'CANCELLED';
      expiredReason = transaction_status === 'expire' ? 'expired' : 'failed';
    } else if (transaction_status === 'pending') {
      newStatus = 'PENDING';
    }

    const resolvedPaymentMethod = payment_method || (transaction_status === 'pending' ? 'pending' : null);

    if (resolvedPaymentMethod && !rOrder.payment_method) {
      await connection.query(
        `UPDATE resale_orders
         SET payment_method = ?
         WHERE id = ? AND (payment_method IS NULL OR payment_method = '')`,
        [resolvedPaymentMethod, rOrder.id]
      );
    }

    if (transaction_status === 'pending' && rOrder.status === 'PENDING' && !rOrder.payment_method) {
      shouldSendPendingEmail = true;
    }

    if (newStatus === 'PAID') {
      // 2. Update Order
      await connection.query(
        `UPDATE resale_orders
         SET status = 'PAID',
             paid_at = CURRENT_TIMESTAMP,
             payment_method = COALESCE(NULLIF(payment_method, ''), ?)
         WHERE id = ?`,
        [resolvedPaymentMethod || null, rOrder.id]
      );

      // 3. Get Listing
      const [listings] = await connection.query(`SELECT * FROM resale_listings WHERE id = ?`, [rOrder.resale_listing_id]);
      const listing = listings[0];
      await connection.query(`UPDATE resale_listings SET status = 'SOLD', sold_at = CURRENT_TIMESTAMP WHERE id = ?`, [listing.id]);

      // 4. Invalidate Old Ticket
      await connection.query(`UPDATE tickets SET status = 'TRANSFERRED', is_used = 1 WHERE id = ?`, [listing.ticket_id]);

      // 5. Create New Ticket for Buyer
      const [oldTickets] = await connection.query(`SELECT * FROM tickets WHERE id = ?`, [listing.ticket_id]);
      const oldTicket = oldTickets[0];
      const newTicketId = `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
      const newQr = `qr_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
      
      const finalAttendeeDetails = rOrder.attendee_details || oldTicket.attendee_details;

      await connection.query(
        `INSERT INTO tickets (
          id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at,
          quantity, attendee_details, order_item_id, bundle_index, bundle_total
        ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, CURRENT_TIMESTAMP, ?, ?, NULL, ?, ?)`,
        [
          newTicketId,
          rOrder.id,
          rOrder.buyer_id,
          oldTicket.ticket_type_id,
          newQr,
          oldTicket.quantity,
          finalAttendeeDetails,
          Number(oldTicket.bundle_index || 1),
          Number(oldTicket.bundle_total || 1),
        ]
      );

      // 6. Update Seller Balance
      await creditSellerBalanceWithHistory(connection, {
        userId: listing.seller_id,
        amount: Number(rOrder.seller_receives || 0),
        type: BALANCE_TX_TYPES.RESALE_SOLD,
        referenceId: rOrder.id,
        description: `Pendapatan resale tiket (${listing.id})`,
      });

      shouldSendSuccessEmail = true;
      await connection.commit();

      if (shouldSendSuccessEmail) {
        await sendResalePaymentSuccessEmail(pool, rOrder.id, resolvedPaymentMethod || null);
        await sendResaleListingSoldEmail(pool, rOrder.id);
      }

      return { status: 'PAID' };
    } else if (newStatus !== rOrder.status) {
      await connection.query(`UPDATE resale_orders SET status = ? WHERE id = ?`, [newStatus, rOrder.id]);

      if ((newStatus === 'CANCELLED' || newStatus === 'EXPIRED') && rOrder.status === 'PENDING') {
        shouldSendExpiredEmail = true;
      }

      await connection.commit();

      if (shouldSendExpiredEmail) {
        await sendResaleOrderExpiredEmail(pool, rOrder.id, expiredReason);
      }

      return { status: newStatus };
    }
    
    await connection.commit();

    if (shouldSendPendingEmail) {
      await sendResalePendingPaymentEmail(pool, rOrder.id, midtransData || {});
    }

    return { status: rOrder.status };
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('[resale/handleResalePaymentStatus]', err);
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

// Webhook for payment (can be called by Midtrans)
router.post('/payment/webhook', async (req, res) => {
  try {
    const { order_id, transaction_status, fraud_status, payment_type } = req.body;
    await handleResalePaymentStatus(order_id, transaction_status, fraud_status, payment_type || null, req.body || null);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: 'Webhook failed' });
  }
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

// GET /api/resale/admin/withdrawals
router.get('/admin/withdrawals', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.query;
    
    // Permission check: Admin can see all, user can only see their own
    if (req.user.role !== 'SUPER_ADMIN' && (!user_id || user_id !== req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    let query = `
      SELECT w.*, u.name as user_name, u.email as user_email
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
    `;
    const params = [];

    if (user_id) {
      query += ` WHERE w.user_id = ?`;
      params.push(user_id);
    }

    query += ` ORDER BY w.created_at DESC`;
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[resale/admin/withdrawals] Error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar pencairan' });
  }
});

// PUT /api/resale/admin/withdrawals/:id
router.put('/admin/withdrawals/:id', authenticateToken, upload.single('receipt'), async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    const { status, rejected_reason, admin_note } = req.body;
    const receipt_url = req.file ? `/receipts/${req.file.filename}` : null;
    
    const [wds] = await pool.query(`SELECT * FROM withdrawals WHERE id = ?`, [req.params.id]);
    if (wds.length === 0) return res.status(404).json({ error: 'Not found' });
    const wd = wds[0];

    // If COMPLETED: increment total_withdrawn so available balance decreases
    if (status === 'COMPLETED') {
      await pool.query(
        `UPDATE seller_balances SET total_withdrawn = total_withdrawn + ? WHERE id = ?`,
        [wd.amount, wd.seller_balance_id]
      );
    }

    // If REJECTED: refund balance (only if it was previously deducted)
    if (status === 'REJECTED') {
      if (wd.status === 'PENDING' || wd.status === 'PROCESSING') {
        // For EO: total_withdrawn was NOT pre-deducted, so no refund needed
        // (EO balance is computed dynamically: earned - withdrawn)
        // Only refund if seller_balance had balance deducted (resale flow)
        // Check if it's a resale user by checking seller_balances.balance column
        const [balRow] = await pool.query(`SELECT * FROM seller_balances WHERE id = ?`, [wd.seller_balance_id]);
        if (balRow.length > 0 && Number(balRow[0].balance) >= 0) {
          await pool.query(
            `UPDATE seller_balances SET balance = balance + ? WHERE id = ?`,
            [wd.amount, wd.seller_balance_id]
          );
        }
      }
    }

    const fields = [
      'status = ?',
      'rejected_reason = ?',
      'admin_note = ?',
      'processed_at = NOW()'
    ];
    const params = [
      status, 
      rejected_reason || null, 
      admin_note || null
    ];

    if (receipt_url) {
      fields.push('receipt_url = ?');
      params.push(receipt_url);
    }

    params.push(req.params.id);

    console.log('[DEBUG] Payout Update:', {
      sql: `UPDATE withdrawals SET ${fields.join(', ')} WHERE id = ?`,
      params
    });

    await pool.query(
      `UPDATE withdrawals SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ success: true, receipt_url });
  } catch (err) {
    console.error('[resale/admin/update-withdrawal] CRITICAL ERROR:', err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

// GET /api/resale/admin/listings
router.get('/admin/listings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    const [rows] = await pool.query(`
      SELECT rl.*, t.id as ticket_id, u.name as seller_name, u.username as seller_username, e.title as event_title
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      JOIN users u ON rl.seller_id = u.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON tt.event_id = e.id
      ORDER BY rl.listed_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[resale/admin/listings] Error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar resale admin' });
  }
});

// GET /api/resale/admin/balances
router.get('/admin/balances', authenticateToken, async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    // Get all seller_balances with user info, role, and EO profile ID if exists
    const [rows] = await pool.query(`
      SELECT 
        sb.*, 
        u.name as user_name, u.email as user_email, u.role as user_role,
        ep.id as eo_profile_id
      FROM seller_balances sb
      JOIN users u ON sb.user_id = u.id
      LEFT JOIN eo_profiles ep ON u.id = ep.user_id
      ORDER BY sb.updated_at DESC
    `);

    // For EO users: compute total_earned dynamically
    const enriched = await Promise.all(rows.map(async (row) => {
      if (row.user_role === 'EO' && row.eo_profile_id) {
        try {
          const [revRes] = await pool.query(`
            SELECT 
              IFNULL((
                SELECT SUM(oi2.subtotal)
                FROM order_items oi2
                JOIN orders o2 ON oi2.order_id = o2.id
                JOIN ticket_types tt2 ON oi2.ticket_type_id = tt2.id
                JOIN events e2 ON tt2.event_id = e2.id
                WHERE e2.eo_profile_id = ?
                  AND o2.status = 'PAID'
              ), 0) as totalRevenue,
              IFNULL(SUM(CASE 
                WHEN t.status IN ('USED', 'TRANSFERRED') OR e.start_date < CURRENT_DATE() 
                THEN (
                  (oi.subtotal * GREATEST(1, COALESCE(t.quantity, 1))) /
                  GREATEST(1, CASE
                    WHEN COALESCE(tt.is_bundle, 0) = 1 THEN oi.quantity * GREATEST(2, COALESCE(tt.bundle_qty, 2))
                    ELSE oi.quantity
                  END)
                )
                ELSE 0 
              END), 0) as withdrawableRevenue
            FROM order_items oi
            JOIN tickets t ON oi.id = t.order_item_id
            JOIN orders o ON oi.order_id = o.id
            JOIN ticket_types tt ON oi.ticket_type_id = tt.id
            JOIN events e ON tt.event_id = e.id
            WHERE e.eo_profile_id = ? 
              AND o.status = 'PAID'
          `, [row.eo_profile_id, row.eo_profile_id]);
          
          const totalEarned = Number(revRes[0].totalRevenue);
          const withdrawableRevenue = Number(revRes[0].withdrawableRevenue);
          const totalWithdrawn = Number(row.total_withdrawn || 0);
          
          return {
            ...row,
            total_earned: totalEarned,
            balance: Math.max(0, withdrawableRevenue - totalWithdrawn),
          };
        } catch (e) {
          console.error(`[resale/admin/balances] Error calculating for EO ${row.user_email}:`, e);
        }
      }
      return row;
    }));

    res.json(enriched);
  } catch (err) {
    console.error('[resale/admin/balances] Error:', err);
    res.status(500).json({ error: 'Gagal memuat saldo penjual' });
  }
});

export default router;
