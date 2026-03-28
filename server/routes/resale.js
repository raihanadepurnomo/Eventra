import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireVerifiedEmail } from '../middleware/auth.js';
import midtransClient from 'midtrans-client';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

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
async function checkEscrowExpiration() {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  // 1. Expire Listings (7 days)
  const [expiredListings] = await pool.query(
    `SELECT id, ticket_id FROM resale_listings WHERE status = 'OPEN' AND expired_at < ?`,
    [now]
  );
  
  if (expiredListings.length > 0) {
    const ids = expiredListings.map(l => l.id);
    const ticketIds = expiredListings.map(l => l.ticket_id);
    
    await pool.query(`UPDATE resale_listings SET status = 'EXPIRED' WHERE id IN (?)`, [ids]);
    await pool.query(`UPDATE tickets SET status = 'ACTIVE' WHERE id IN (?)`, [ticketIds]);
  }

  // 2. Expire Orders (15 minutes)
  const [expiredOrders] = await pool.query(
    `SELECT id, resale_listing_id FROM resale_orders WHERE status = 'PENDING' AND expired_at < ?`,
    [now]
  );

  if (expiredOrders.length > 0) {
    const ids = expiredOrders.map(o => o.id);
    await pool.query(`UPDATE resale_orders SET status = 'EXPIRED' WHERE id IN (?)`, [ids]);
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
      `SELECT t.*, tt.price as original_price, tt.sale_end_date, e.start_date, e.is_resale_allowed
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
export async function handleResalePaymentStatus(order_id, transaction_status, fraud_status) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

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
      newStatus = 'CANCELLED';
    }

    if (newStatus === 'PAID') {
      // 2. Update Order
      await connection.query(`UPDATE resale_orders SET status = 'PAID', paid_at = CURRENT_TIMESTAMP WHERE id = ?`, [rOrder.id]);

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
        `INSERT INTO tickets (id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at, quantity, attendee_details, order_item_id)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, CURRENT_TIMESTAMP, ?, ?, NULL)`,
        [newTicketId, rOrder.id, rOrder.buyer_id, oldTicket.ticket_type_id, newQr, oldTicket.quantity, finalAttendeeDetails]
      );

      // 6. Update Seller Balance
      const [balances] = await connection.query(`SELECT * FROM seller_balances WHERE user_id = ?`, [listing.seller_id]);
      if (balances.length === 0) {
        const balId = `bal_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
        await connection.query(
          `INSERT INTO seller_balances (id, user_id, balance, total_earned) VALUES (?, ?, ?, ?)`,
          [balId, listing.seller_id, rOrder.seller_receives, rOrder.seller_receives]
        );
      } else {
        await connection.query(
          `UPDATE seller_balances SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?`,
          [rOrder.seller_receives, rOrder.seller_receives, balances[0].id]
        );
      }

      await connection.commit();
      return { status: 'PAID' };
    } else if (newStatus !== rOrder.status) {
      await connection.query(`UPDATE resale_orders SET status = ? WHERE id = ?`, [newStatus, rOrder.id]);
      await connection.commit();
      return { status: newStatus };
    }
    
    await connection.commit();
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
    const { order_id, transaction_status, fraud_status } = req.body;
    await handleResalePaymentStatus(order_id, transaction_status, fraud_status);
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
              IFNULL(SUM(oi.subtotal), 0) as totalRevenue,
              IFNULL(SUM(CASE 
                WHEN t.status IN ('USED', 'TRANSFERRED') OR e.start_date < CURRENT_DATE() 
                THEN (oi.subtotal / oi.quantity)
                ELSE 0 
              END), 0) as withdrawableRevenue
            FROM order_items oi
            JOIN tickets t ON oi.id = t.order_item_id
            JOIN orders o ON oi.order_id = o.id
            JOIN ticket_types tt ON oi.ticket_type_id = tt.id
            JOIN events e ON tt.event_id = e.id
            WHERE e.eo_profile_id = ? 
              AND o.status = 'PAID'
          `, [row.eo_profile_id]);
          
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
