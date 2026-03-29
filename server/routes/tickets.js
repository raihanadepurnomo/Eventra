import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { generateTicketsForPaidOrder } from '../lib/ticketGeneration.js';
import { sendPaymentSuccessEmail, sendResalePaymentSuccessEmail, sendTicketCheckInSuccessEmail } from '../lib/transactionalEmails.js';
import { generateOrderTicketPdfBuffer } from '../lib/ticketPdf.js';

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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAttendeeRows(rawAttendees) {
  if (!Array.isArray(rawAttendees)) return [];
  return rawAttendees.map((row) => (isObject(row) ? row : {}));
}

function buildSingleAttendeeJson(attendee) {
  if (!isObject(attendee)) return JSON.stringify([{}]);
  return JSON.stringify([attendee]);
}

function sanitizeFilename(name = 'tickets') {
  return String(name || 'tickets')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'tickets';
}

function toDbDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeQrCodeInput(raw) {
  if (raw === null || raw === undefined) return '';

  const original = String(raw).trim();
  if (!original) return '';

  let decoded = original;
  try {
    decoded = decodeURIComponent(original);
  } catch {
    decoded = original;
  }

  const cleaned = decoded.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const qrTokenMatch = cleaned.match(/qr_[a-z0-9]+/i);
  if (qrTokenMatch?.[0]) {
    return qrTokenMatch[0].trim();
  }

  try {
    const url = new URL(cleaned);
    const fromQuery =
      url.searchParams.get('qr_code') ||
      url.searchParams.get('code') ||
      url.searchParams.get('qr') ||
      url.searchParams.get('ticket');

    if (fromQuery) {
      const fromQueryMatch = String(fromQuery).match(/qr_[a-z0-9]+/i);
      return (fromQueryMatch?.[0] || String(fromQuery)).trim();
    }

    const fromPathMatch = url.pathname.match(/qr_[a-z0-9]+/i);
    if (fromPathMatch?.[0]) {
      return fromPathMatch[0].trim();
    }
  } catch {
    // not a URL, ignore
  }

  return cleaned.split(' ')[0].trim();
}

async function splitLegacySingleTicket(conn, ticketRow) {
  const seatCount = Math.max(1, Number(ticketRow.quantity || 1));
  if (seatCount <= 1) return 0;

  const attendeeRows = normalizeAttendeeRows(parseJsonMaybe(ticketRow.attendee_details, []));
  const firstAttendee = attendeeRows[0] || {};

  await conn.query(
    `UPDATE tickets
     SET quantity = 1,
         attendee_details = ?,
         bundle_index = 1,
         bundle_total = 1
     WHERE id = ?`,
    [buildSingleAttendeeJson(firstAttendee), ticketRow.id]
  );

  let created = 0;
  for (let i = 1; i < seatCount; i += 1) {
    const attendee = attendeeRows[i] || {};
    const newTicketId = `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`;
    const newQr = `qr_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

    await conn.query(
      `INSERT INTO tickets (
        id, order_id, user_id, ticket_type_id, qr_code, status, is_used, used_at, created_at,
        quantity, attendee_details, order_item_id, bundle_index, bundle_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, 1)`,
      [
        newTicketId,
        ticketRow.order_id,
        ticketRow.user_id,
        ticketRow.ticket_type_id,
        newQr,
        ticketRow.status || 'ACTIVE',
        Number(ticketRow.is_used || 0),
        ticketRow.used_at || null,
        ticketRow.created_at || toDbDateTime(),
        buildSingleAttendeeJson(attendee),
        ticketRow.order_item_id || null,
      ]
    );

    created += 1;
  }

  return created;
}

async function normalizeLegacyMultiQtyTicketsForUser(userId, onlyTicketId = null) {
  if (!userId) return;

  const conn = await pool.getConnection();
  try {
    let query =
      `SELECT t.*, tt.is_bundle
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       WHERE t.user_id = ?
         AND t.status = 'ACTIVE'
         AND COALESCE(tt.is_bundle, 0) = 0
         AND COALESCE(t.bundle_total, 1) = 1
         AND COALESCE(t.quantity, 1) > 1`;
    const params = [userId];

    if (onlyTicketId) {
      query += ' AND t.id = ?';
      params.push(onlyTicketId);
    }

    query += ' ORDER BY t.created_at DESC, t.id DESC LIMIT 50';

    const [legacyRows] = await conn.query(query, params);

    for (const row of legacyRows) {
      try {
        await conn.beginTransaction();

        const [lockedRows] = await conn.query(
          `SELECT t.*, tt.is_bundle
           FROM tickets t
           JOIN ticket_types tt ON tt.id = t.ticket_type_id
           WHERE t.id = ? AND t.user_id = ?
           FOR UPDATE`,
          [row.id, userId]
        );

        if (!lockedRows.length) {
          await conn.rollback();
          continue;
        }

        const ticket = lockedRows[0];
        const isLegacyMultiQty =
          ticket.status === 'ACTIVE' &&
          Number(ticket.is_bundle || 0) !== 1 &&
          Number(ticket.bundle_total || 1) === 1 &&
          Number(ticket.quantity || 1) > 1;

        if (!isLegacyMultiQty) {
          await conn.rollback();
          continue;
        }

        const [openListings] = await conn.query(
          `SELECT id FROM resale_listings WHERE ticket_id = ? AND status = 'OPEN' LIMIT 1`,
          [ticket.id]
        );
        if (openListings.length > 0) {
          await conn.rollback();
          continue;
        }

        await splitLegacySingleTicket(conn, ticket);
        await conn.commit();
      } catch (err) {
        try {
          await conn.rollback();
        } catch {
          // ignore rollback failure
        }
        console.error('[tickets/normalize-legacy-multi-qty]', row.id, err?.message || err);
      }
    }
  } finally {
    conn.release();
  }
}

async function backfillPaidOrdersWithoutTickets(userId) {
  if (!userId) return;

  const [orders] = await pool.query(
    `SELECT o.id, o.user_id, o.paid_at, o.payment_method
     FROM orders o
     LEFT JOIN tickets t ON t.order_id = o.id
     WHERE o.user_id = ?
       AND o.status = 'PAID'
     GROUP BY o.id, o.user_id, o.paid_at, o.payment_method
     HAVING COUNT(t.id) = 0
     ORDER BY o.paid_at DESC, o.id DESC
     LIMIT 20`,
    [userId]
  );

  for (const order of orders) {
    try {
      const paidAt = typeof order.paid_at === 'string' && order.paid_at
        ? order.paid_at
        : toDbDateTime();

      const generated = await generateTicketsForPaidOrder(pool, {
        orderId: order.id,
        userId: order.user_id,
        now: paidAt,
      });

      if (generated.generatedTickets.length > 0) {
        await sendPaymentSuccessEmail(pool, order.id, order.payment_method || null);
      }
    } catch (err) {
      console.error('[tickets/backfill-paid-order]', order.id, err?.message || err);
    }
  }
}

async function backfillPaidResaleOrdersWithoutTickets(userId) {
  if (!userId) return;

  const [orders] = await pool.query(
    `SELECT ro.id, ro.buyer_id, ro.resale_listing_id, ro.attendee_details, ro.payment_method
     FROM resale_orders ro
     LEFT JOIN tickets t ON t.order_id = ro.id
     WHERE ro.buyer_id = ?
       AND ro.status = 'PAID'
     GROUP BY ro.id, ro.buyer_id, ro.resale_listing_id, ro.attendee_details, ro.payment_method
     HAVING COUNT(t.id) = 0
     ORDER BY ro.paid_at DESC, ro.id DESC
     LIMIT 20`,
    [userId]
  );

  for (const order of orders) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [lockedOrders] = await conn.query(
        `SELECT * FROM resale_orders WHERE id = ? AND buyer_id = ? AND status = 'PAID' FOR UPDATE`,
        [order.id, userId]
      );
      if (!lockedOrders.length) {
        await conn.rollback();
        continue;
      }

      const [existingTickets] = await conn.query(
        `SELECT id FROM tickets WHERE order_id = ? LIMIT 1`,
        [order.id]
      );
      if (existingTickets.length > 0) {
        await conn.rollback();
        continue;
      }

      const [listings] = await conn.query(
        `SELECT * FROM resale_listings WHERE id = ? LIMIT 1`,
        [lockedOrders[0].resale_listing_id]
      );
      if (!listings.length) {
        await conn.rollback();
        continue;
      }
      const listing = listings[0];

      const [oldTicketRows] = await conn.query(
        `SELECT * FROM tickets WHERE id = ? LIMIT 1`,
        [listing.ticket_id]
      );
      if (!oldTicketRows.length) {
        await conn.rollback();
        continue;
      }
      const oldTicket = oldTicketRows[0];

      await conn.query(
        `UPDATE resale_listings
         SET status = 'SOLD', sold_at = COALESCE(sold_at, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [listing.id]
      );

      await conn.query(
        `UPDATE tickets
         SET status = 'TRANSFERRED', is_used = 1
         WHERE id = ?`,
        [listing.ticket_id]
      );

      const newTicketId = `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
      const newQr = `qr_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const finalAttendeeDetails = lockedOrders[0].attendee_details || oldTicket.attendee_details;

      await conn.query(
        `INSERT INTO tickets (
          id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at,
          quantity, attendee_details, order_item_id, bundle_index, bundle_total
        ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, CURRENT_TIMESTAMP, ?, ?, NULL, ?, ?)`,
        [
          newTicketId,
          lockedOrders[0].id,
          lockedOrders[0].buyer_id,
          oldTicket.ticket_type_id,
          newQr,
          Number(oldTicket.quantity || 1),
          finalAttendeeDetails,
          Number(oldTicket.bundle_index || 1),
          Number(oldTicket.bundle_total || 1),
        ]
      );

      await conn.commit();
      await sendResalePaymentSuccessEmail(pool, lockedOrders[0].id, lockedOrders[0].payment_method || null);
    } catch (err) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          // ignore rollback errors
        }
      }
      console.error('[tickets/backfill-paid-resale-order]', order.id, err?.message || err);
    } finally {
      if (conn) conn.release();
    }
  }
}

// GET /api/tickets/validate
router.get('/validate', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const normalizedQr = normalizeQrCodeInput(req.query.qr_code || req.query.code || req.query.qr);
    if (!normalizedQr) {
      return res.status(400).json({ error: 'Kode QR tidak valid.' });
    }

    const selectedEventId = req.query.event_id && req.query.event_id !== 'all'
      ? String(req.query.event_id)
      : null;

    const conditions = ['LOWER(TRIM(t.qr_code)) = LOWER(TRIM(?))'];
    const params = [normalizedQr];

    if (selectedEventId) {
      conditions.push('e.id = ?');
      params.push(selectedEventId);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      conditions.push('ep.user_id = ?');
      params.push(req.user.id);
    }

    const [rows] = await pool.query(
      `SELECT
         t.*,
         tt.id AS tt_id,
         tt.event_id AS tt_event_id,
         tt.name AS tt_name,
         tt.description AS tt_description,
         tt.price AS tt_price,
         tt.quota AS tt_quota,
         tt.sold AS tt_sold,
         tt.max_per_order AS tt_max_per_order,
         tt.max_per_account AS tt_max_per_account,
         tt.is_bundle AS tt_is_bundle,
         tt.bundle_qty AS tt_bundle_qty,
         tt.sale_start_date AS tt_sale_start_date,
         tt.sale_end_date AS tt_sale_end_date,
         e.id AS ev_id,
         e.eo_profile_id AS ev_eo_profile_id,
         e.title AS ev_title,
         e.description AS ev_description,
         e.category AS ev_category,
         e.banner_image AS ev_banner_image,
         e.location AS ev_location,
         e.location_url AS ev_location_url,
         e.start_date AS ev_start_date,
         e.end_date AS ev_end_date,
         e.status AS ev_status,
         e.is_resale_allowed AS ev_is_resale_allowed,
         e.created_at AS ev_created_at,
         e.updated_at AS ev_updated_at,
         o.id AS ord_id,
         o.user_id AS ord_user_id,
         o.total_amount AS ord_total_amount,
         o.discount_amount AS ord_discount_amount,
         o.promo_code_id AS ord_promo_code_id,
         o.status AS ord_status,
         o.payment_method AS ord_payment_method,
         o.payment_token AS ord_payment_token,
         o.paid_at AS ord_paid_at,
         o.expired_at AS ord_expired_at,
         o.created_at AS ord_created_at,
         ro.id AS rord_id,
         ro.buyer_id AS rord_buyer_id,
         ro.total_paid AS rord_total_paid,
         ro.status AS rord_status,
         ro.payment_method AS rord_payment_method,
         ro.payment_token AS rord_payment_token,
         ro.paid_at AS rord_paid_at,
         ro.expired_at AS rord_expired_at,
         ro.created_at AS rord_created_at,
         u.id AS usr_id,
         u.email AS usr_email,
         u.name AS usr_name,
         u.phone AS usr_phone,
         u.role AS usr_role,
         u.image AS usr_image,
         u.is_email_verified AS usr_is_email_verified,
         u.created_at AS usr_created_at,
         u.updated_at AS usr_updated_at
       FROM tickets t
       LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
       LEFT JOIN events e ON e.id = tt.event_id
       LEFT JOIN eo_profiles ep ON ep.id = e.eo_profile_id
       LEFT JOIN orders o ON o.id = t.order_id
      LEFT JOIN resale_orders ro ON ro.id = t.order_id
       LEFT JOIN users u ON u.id = t.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 1`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Tiket tidak ditemukan atau bukan milik event Anda.' });
    }

    const row = rows[0];

    res.json({
      normalized_qr_code: normalizedQr,
      ticket: {
        id: row.id,
        order_id: row.order_id,
        user_id: row.user_id,
        ticket_type_id: row.ticket_type_id,
        qr_code: row.qr_code,
        status: row.status,
        is_used: row.is_used,
        used_at: row.used_at,
        created_at: row.created_at,
        quantity: row.quantity,
        attendee_details: row.attendee_details,
        order_item_id: row.order_item_id,
        bundle_index: row.bundle_index,
        bundle_total: row.bundle_total,
      },
      ticket_type: row.tt_id
        ? {
            id: row.tt_id,
            event_id: row.tt_event_id,
            name: row.tt_name,
            description: row.tt_description,
            price: row.tt_price,
            quota: row.tt_quota,
            sold: row.tt_sold,
            max_per_order: row.tt_max_per_order,
            max_per_account: row.tt_max_per_account,
            is_bundle: row.tt_is_bundle,
            bundle_qty: row.tt_bundle_qty,
            sale_start_date: row.tt_sale_start_date,
            sale_end_date: row.tt_sale_end_date,
          }
        : null,
      event: row.ev_id
        ? {
            id: row.ev_id,
            eo_profile_id: row.ev_eo_profile_id,
            title: row.ev_title,
            description: row.ev_description,
            category: row.ev_category,
            banner_image: row.ev_banner_image,
            location: row.ev_location,
            location_url: row.ev_location_url,
            start_date: row.ev_start_date,
            end_date: row.ev_end_date,
            status: row.ev_status,
            is_resale_allowed: row.ev_is_resale_allowed,
            created_at: row.ev_created_at,
            updated_at: row.ev_updated_at,
          }
        : null,
      order: row.ord_id || row.rord_id
        ? {
            id: row.ord_id || row.rord_id,
            user_id: row.ord_user_id || row.rord_buyer_id,
            total_amount: row.ord_id ? row.ord_total_amount : row.rord_total_paid,
            total_paid: row.rord_total_paid,
            discount_amount: row.ord_discount_amount || 0,
            promo_code_id: row.ord_promo_code_id || null,
            status: row.ord_status || row.rord_status,
            payment_method: row.ord_payment_method || row.rord_payment_method,
            payment_token: row.ord_payment_token || row.rord_payment_token,
            paid_at: row.ord_paid_at || row.rord_paid_at,
            expired_at: row.ord_expired_at || row.rord_expired_at,
            created_at: row.ord_created_at || row.rord_created_at,
          }
        : null,
      user: row.usr_id
        ? {
            id: row.usr_id,
            email: row.usr_email,
            name: row.usr_name,
            phone: row.usr_phone,
            role: row.usr_role,
            image: row.usr_image,
            is_email_verified: row.usr_is_email_verified,
            created_at: row.usr_created_at,
            updated_at: row.usr_updated_at,
          }
        : null,
    });
  } catch (err) {
    console.error('[tickets/validate]', err);
    res.status(500).json({ error: 'Gagal memvalidasi tiket.' });
  }
});

// GET /api/tickets
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.query.user_id) {
      const targetUserId = String(req.query.user_id);
      const isSelf = targetUserId === req.user.id;

      if (isSelf) {
        await backfillPaidOrdersWithoutTickets(targetUserId);
        await backfillPaidResaleOrdersWithoutTickets(targetUserId);
        await normalizeLegacyMultiQtyTicketsForUser(targetUserId);
      }
    }

    let query = 'SELECT * FROM tickets';
    const conditions = [];
    const params = [];

    if (req.query.user_id) {
      conditions.push('user_id = ?');
      params.push(req.query.user_id);
    }
    if (req.query.qr_code) {
      const normalizedQr = normalizeQrCodeInput(req.query.qr_code);
      if (!normalizedQr) {
        return res.json([]);
      }
      conditions.push('LOWER(TRIM(qr_code)) = LOWER(TRIM(?))');
      params.push(normalizedQr);
    }
    if (req.query.status) {
      conditions.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.order_id) {
      conditions.push('order_id = ?');
      params.push(req.query.order_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[tickets/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tickets/order/:orderId/pdf
router.get('/order/:orderId/pdf', authenticateToken, async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID tidak valid' });
    }

    const statusFilterRaw = String(req.query.status || '').trim();
    const allowedStatuses = new Set(['ACTIVE', 'USED', 'CANCELLED', 'LISTED_FOR_RESALE', 'TRANSFERRED', 'EXPIRED']);
    const statusFilter = allowedStatuses.has(statusFilterRaw) ? statusFilterRaw : null;

    const params = [orderId];
    const ownershipSql = req.user.role === 'SUPER_ADMIN' ? '' : ' AND t.user_id = ?';
    if (req.user.role !== 'SUPER_ADMIN') {
      params.push(req.user.id);
    }

    let statusSql = '';
    if (statusFilter === 'ACTIVE') {
      statusSql = `
        AND t.status = 'ACTIVE'
        AND COALESCE(t.is_used, 0) = 0
        AND (e.end_date IS NULL OR e.end_date >= CURRENT_TIMESTAMP)
      `;
    } else if (statusFilter === 'USED') {
      statusSql = `
        AND (
          t.status = 'USED'
          OR (COALESCE(t.is_used, 0) = 1 AND t.status <> 'TRANSFERRED')
        )
      `;
    } else if (statusFilter === 'EXPIRED') {
      statusSql = `
        AND t.status = 'ACTIVE'
        AND COALESCE(t.is_used, 0) = 0
        AND e.end_date < CURRENT_TIMESTAMP
      `;
    } else if (statusFilter) {
      statusSql = ' AND t.status = ?';
      params.push(statusFilter);
    }

    const [tickets] = await pool.query(
      `SELECT
         t.*,
         tt.name AS ticket_name,
         tt.is_bundle,
         tt.bundle_qty,
         e.id AS event_id,
         e.title AS event_title,
         e.start_date AS event_start_date,
         e.end_date AS event_end_date,
         e.location AS event_location,
         ep.org_name AS eo_name
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       JOIN events e ON e.id = tt.event_id
       LEFT JOIN eo_profiles ep ON ep.id = e.eo_profile_id
       WHERE t.order_id = ?${ownershipSql}${statusSql}
       ORDER BY t.created_at ASC, t.id ASC`,
      params
    );

    if (!tickets.length) {
      return res.status(404).json({ error: 'Tiket untuk order ini tidak ditemukan' });
    }

    const first = tickets[0];
    const event = {
      id: first.event_id,
      title: first.event_title,
      startDate: first.event_start_date,
      endDate: first.event_end_date,
      location: first.event_location,
      eoName: first.eo_name,
    };

    const pdfBuffer = await generateOrderTicketPdfBuffer({
      platformName: 'Eventra',
      tickets,
      event,
      eoName: first.eo_name || '-',
    });

    if (!pdfBuffer) {
      return res.status(500).json({ error: 'Gagal membuat PDF tiket' });
    }

    const fileName = `tickets-${sanitizeFilename(event.title || orderId)}-${sanitizeFilename(orderId)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[tickets/order-pdf]', err);
    return res.status(500).json({ error: 'Gagal mengunduh PDF tiket' });
  }
});

// GET /api/tickets/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    await normalizeLegacyMultiQtyTicketsForUser(req.user.id, req.params.id);
    const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tickets
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      id,
      order_id,
      user_id,
      ticket_type_id,
      qr_code,
      status,
      quantity,
      attendee_details,
      order_item_id,
      bundle_index,
      bundle_total,
    } = req.body;
    const ticketId = id || `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const attendeeJson = attendee_details ? JSON.stringify(attendee_details) : null;
    const bundleIndex = Number(bundle_index || 1);
    const bundleTotal = Number(bundle_total || 1);

    await pool.query(
      `INSERT INTO tickets (
        id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at,
        quantity, attendee_details, order_item_id, bundle_index, bundle_total
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        ticketId,
        order_id,
        user_id || req.user.id,
        ticket_type_id,
        qr_code || crypto.randomUUID(),
        status || 'ACTIVE',
        now,
        quantity || 1,
        attendeeJson,
        order_item_id,
        Number.isFinite(bundleIndex) ? bundleIndex : 1,
        Number.isFinite(bundleTotal) ? bundleTotal : 1,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[tickets/create]', err);
    res.status(500).json({ error: 'Gagal membuat ticket' });
  }
});

// PUT /api/tickets/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const [beforeRows] = await pool.query('SELECT id, status, is_used, used_at FROM tickets WHERE id = ? LIMIT 1', [req.params.id]);
    if (!beforeRows.length) {
      return res.status(404).json({ error: 'Ticket tidak ditemukan' });
    }

    const fields = [];
    const values = [];
    const allowed = ['status', 'is_used', 'used_at', 'quantity', 'attendee_details'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        const val = (key === 'attendee_details' && typeof req.body[key] !== 'string') 
          ? JSON.stringify(req.body[key]) 
          : req.body[key];
        values.push(val);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    values.push(req.params.id);

    await pool.query(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [req.params.id]);

    const before = beforeRows[0];
    const becameUsed = (Number(before.is_used || 0) === 0 && String(before.status || '').toUpperCase() !== 'USED')
      && (
        Number(req.body.is_used || 0) === 1
        || String(req.body.status || '').toUpperCase() === 'USED'
      );

    if (becameUsed) {
      const checkedInAt = req.body.used_at || rows?.[0]?.used_at || new Date().toISOString();
      sendTicketCheckInSuccessEmail(pool, req.params.id, { checkedInAt }).catch((mailErr) => {
        console.error('[tickets/checkin-email]', req.params.id, mailErr?.message || mailErr);
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
