import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireVerifiedEmail } from '../middleware/auth.js';
import XLSX from 'xlsx';

const router = Router();

function parseJsonMaybe(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function sanitizeFilename(name) {
  return String(name || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'event';
}

// GET /api/eo/balance
router.get('/balance', authenticateToken, async (req, res) => {
  console.log(`[eoAuth/balance] Request from user: ${req.user?.id}`);
  try {
    const userId = req.user.id;
    
    // 1. Get EO profile ID
    const [profiles] = await pool.query('SELECT id FROM eo_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(403).json({ error: 'EO profile not found' });
    const eoProfileId = profiles[0].id;

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
    `, [eoProfileId, eoProfileId]);
    
    const totalEarned = Number(revRes[0].totalRevenue);
    const withdrawableRevenue = Number(revRes[0].withdrawableRevenue);
    
    console.log(`[eoAuth/balance] EO: ${eoProfileId}, Earned: ${totalEarned}, Withdrawable: ${withdrawableRevenue}`);

    // 3. Get Withdrawal status from seller_balances (recorded withdrawals)
    const [balances] = await pool.query('SELECT * FROM seller_balances WHERE user_id = ?', [userId]);
    let balanceRecord = balances[0];
    
    if (!balanceRecord) {
      console.log(`[eoAuth/balance] Creating new balance record for user: ${userId}`);
      const id = `bal_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
      await pool.query('INSERT INTO seller_balances (id, user_id, balance, total_earned, total_withdrawn) VALUES (?, ?, 0, 0, 0)', [id, userId]);
      balanceRecord = { id, user_id: userId, balance: 0, total_earned: 0, total_withdrawn: 0 };
    }

    const withdrawn = Number(balanceRecord.total_withdrawn || 0);
    const availableBalance = Math.max(0, withdrawableRevenue - withdrawn);

    console.log(`[eoAuth/balance] Final - Earned: ${totalEarned}, Withdrawable: ${withdrawableRevenue}, Withdrawn: ${withdrawn}, Avail: ${availableBalance}`);

    res.json({
      availableBalance,
      totalEarned: totalEarned,
      totalWithdrawn: withdrawn,
      balanceId: balanceRecord.id
    });
  } catch (err) {
    console.error('CRITICAL: [eoAuth/balance] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// GET /api/eo/withdrawals
router.get('/withdrawals', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[eoAuth/withdrawals]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/eo/withdraw
router.post('/withdraw', authenticateToken, requireVerifiedEmail, async (req, res) => {
  try {
    const { amount, bank_name, account_number, account_name, balance_id } = req.body;
    if (amount < 50000) return res.status(400).json({ error: 'Minimal pencairan Rp 50.000' });

    // Cek pending withdrawal
    const [pending] = await pool.query(`SELECT id FROM withdrawals WHERE user_id = ? AND status IN ('PENDING', 'PROCESSING')`, [req.user.id]);
    if (pending.length > 0) return res.status(400).json({ error: 'Masih ada permintaan pencairan yang sedang diproses' });

    // Validate balance again
    const userId = req.user.id;
    const [profiles] = await pool.query('SELECT id FROM eo_profiles WHERE user_id = ?', [userId]);
    const eoProfileId = profiles[0].id;
    const [revRes] = await pool.query(`
      SELECT IFNULL(SUM(CASE 
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
    `, [eoProfileId]);
    
    const withdrawableRevenue = Number(revRes[0].withdrawableRevenue);
    console.log(`[eoAuth/withdraw] EO: ${eoProfileId}, Withdrawable: ${withdrawableRevenue}`);
    const [balances] = await pool.query('SELECT total_withdrawn FROM seller_balances WHERE user_id = ?', [userId]);
    const totalWithdrawn = balances[0]?.total_withdrawn || 0;
    const availableBalance = Math.max(0, withdrawableRevenue - totalWithdrawn);

    if (amount > availableBalance) {
      return res.status(400).json({ error: 'Saldo tidak mencukupi' });
    }

    const wdId = `wd_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    
    // Transactional update
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // We increment total_withdrawn in seller_balances
      // Wait, should we? In admin payout update, we might increment it again or subtract balance.
      // Let's keep it consistent: total_withdrawn is incremented ONLY when COMPLETED.
      // Wait, user resale logic: updates balance immediately.
      // For EO, it depends on how we calculate it. 
      // If balance is dynamic, we should track 'withdraw_pending' if we want.
      // Actually, simple way: only allow ONE active withdrawal.
      
      await connection.query(
        `INSERT INTO withdrawals (id, seller_balance_id, user_id, amount, bank_name, account_number, account_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [wdId, balance_id, req.user.id, amount, bank_name, account_number, account_name]
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
    console.error('[eoAuth/withdraw]', err);
    res.status(500).json({ error: 'Gagal mengajukan pencairan' });
  }
});

// GET /api/eo/events/:eventId/attendees/export
router.get('/events/:eventId/attendees/export', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;

    const [eventRows] = await pool.query(
      `SELECT e.id, e.title, ep.user_id
       FROM events e
       JOIN eo_profiles ep ON ep.id = e.eo_profile_id
       WHERE e.id = ?
       LIMIT 1`,
      [eventId]
    );

    if (!eventRows.length) {
      return res.status(404).json({ error: 'Event tidak ditemukan.' });
    }

    const event = eventRows[0];
    if (req.user.role !== 'SUPER_ADMIN' && event.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const [fields] = await pool.query(
      `SELECT id, label, applies_to, sort_order
       FROM custom_form_fields
       WHERE event_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [eventId]
    );

    const [tickets] = await pool.query(
      `SELECT
         t.id AS ticket_id,
         t.order_id,
         t.status AS ticket_status,
         t.quantity,
         t.bundle_index,
         t.bundle_total,
         t.attendee_details,
         tt.name AS ticket_type_name,
         tt.is_bundle,
         tt.bundle_qty,
         u.name AS buyer_name,
         u.email AS buyer_email
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       JOIN users u ON u.id = t.user_id
       WHERE tt.event_id = ?
         AND o.status = 'PAID'
         AND t.status NOT IN ('CANCELLED', 'TRANSFERRED')
       ORDER BY t.created_at ASC, t.id ASC`,
      [eventId]
    );

    const [answers] = await pool.query(
      `SELECT a.field_id, a.order_id, a.ticket_id, a.answer
       FROM custom_form_answers a
       JOIN custom_form_fields f ON f.id = a.field_id
       WHERE f.event_id = ?`,
      [eventId]
    );

    const perOrderAnswers = new Map();
    const perTicketAnswers = new Map();

    for (const answer of answers) {
      if (answer.ticket_id) {
        const key = `${answer.ticket_id}:${answer.field_id}`;
        const existing = perTicketAnswers.get(key);
        if (Array.isArray(existing)) {
          existing.push(answer.answer);
          perTicketAnswers.set(key, existing);
        } else {
          perTicketAnswers.set(key, [answer.answer]);
        }
      } else {
        const key = `${answer.order_id}:${answer.field_id}`;
        perOrderAnswers.set(key, answer.answer);
      }
    }

    const rows = tickets.map((ticket, index) => {
      const parsedDetails = parseJsonMaybe(ticket.attendee_details, []);
      const attendees = Array.isArray(parsedDetails) ? parsedDetails : [];
      const attendeeNames = attendees.map((a) => String(a?.name || '').trim()).filter(Boolean);
      const attendeeEmails = attendees.map((a) => String(a?.email || '').trim()).filter(Boolean);

      const holderName = attendeeNames.length > 0 ? attendeeNames.join(', ') : (ticket.buyer_name || '-');
      const holderEmail = attendeeEmails.length > 0 ? attendeeEmails.join(', ') : (ticket.buyer_email || '-');
      const baseTypeName = ticket.ticket_type_name || '-';
      const bundleTotal = Number(ticket.bundle_total || 1);
      const bundleIndex = Number(ticket.bundle_index || 1);
      const isBundle = Number(ticket.is_bundle || 0) === 1;
      const bundleQty = Math.max(2, Number(ticket.bundle_qty || ticket.quantity || 2));
      const ticketTypeLabel = isBundle
        ? (bundleTotal > 1
          ? `${baseTypeName} — Paket ${bundleIndex} dari ${bundleTotal}`
          : `${baseTypeName} — Bundling (${bundleQty} orang)`)
        : baseTypeName;

      const exportRow = {
        No: index + 1,
        'Nama Pemegang': holderName,
        Email: holderEmail,
        'Jenis Tiket': ticketTypeLabel,
        'Status Check-in': ticket.ticket_status === 'USED' ? 'Hadir' : 'Belum',
      };

      for (const field of fields) {
        const label = String(field.label || 'Pertanyaan');
        const answer = field.applies_to === 'order'
          ? perOrderAnswers.get(`${ticket.order_id}:${field.id}`)
          : perTicketAnswers.get(`${ticket.ticket_id}:${field.id}`);
        exportRow[label] = Array.isArray(answer) ? answer.join(' | ') : (answer || '');
      }

      return exportRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');

    const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const safeName = sanitizeFilename(event.title);
    const filename = `attendees-${safeName}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileBuffer);
  } catch (err) {
    console.error('[eo/export-attendees]', err);
    res.status(500).json({ error: 'Gagal mengekspor data peserta.' });
  }
});

export default router;
