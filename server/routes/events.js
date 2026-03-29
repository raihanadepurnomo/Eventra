import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { eventHasPaidTicketSales, getEventCustomFormFields } from '../lib/customForms.js';

const router = Router();

function asBadRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function parseOptions(optionsRaw) {
  if (optionsRaw === null || optionsRaw === undefined) return [];
  if (Array.isArray(optionsRaw)) {
    return optionsRaw.map((opt) => String(opt || '').trim()).filter(Boolean);
  }
  if (typeof optionsRaw === 'string') {
    try {
      const parsed = JSON.parse(optionsRaw);
      if (Array.isArray(parsed)) {
        return parsed.map((opt) => String(opt || '').trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

async function assertCanManageEvent(req, eventId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT e.id, ep.user_id
     FROM events e
     JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     WHERE e.id = ?
     LIMIT 1`,
    [eventId]
  );

  if (!rows.length) {
    throw asBadRequest('Event tidak ditemukan.');
  }

  if (req.user.role !== 'SUPER_ADMIN' && rows[0].user_id !== req.user.id) {
    const err = new Error('Akses ditolak.');
    err.statusCode = 403;
    throw err;
  }
}

function normalizeCustomFieldPayload(body) {
  const label = String(body.label || '').trim();
  const fieldType = String(body.field_type || 'text').trim();
  const appliesTo = String(body.applies_to || 'per_ticket').trim();
  const isRequired = body.is_required === undefined ? true : Boolean(body.is_required);
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

  const allowedFieldTypes = new Set(['text', 'number', 'select', 'radio']);
  const allowedAppliesTo = new Set(['order', 'per_ticket']);

  if (!label) {
    throw asBadRequest('Label pertanyaan wajib diisi.');
  }
  if (!allowedFieldTypes.has(fieldType)) {
    throw asBadRequest('Tipe field tidak valid.');
  }
  if (!allowedAppliesTo.has(appliesTo)) {
    throw asBadRequest('Berlaku untuk tidak valid.');
  }

  const options = parseOptions(body.options);
  if ((fieldType === 'select' || fieldType === 'radio') && options.length === 0) {
    throw asBadRequest('Field select/radio wajib memiliki opsi.');
  }

  return {
    label,
    fieldType,
    appliesTo,
    isRequired,
    sortOrder,
    options: fieldType === 'select' || fieldType === 'radio' ? options : null,
  };
}

// Ensure banner directory exists
const bannerDir = path.join(process.cwd(), '..', 'public', 'banner-image');
if (!fs.existsSync(bannerDir)) {
  fs.mkdirSync(bannerDir, { recursive: true });
}

// Configure multer for banner upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, bannerDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const slug = (req.body.title || 'event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    const timestamp = Date.now();
    cb(null, `${slug}_${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file JPG, JPEG, PNG yang diizinkan'));
    }
  },
});

// GET /api/events — list events
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM events';
    const params = [];

    if (req.query.status) {
      query += ' WHERE status = ?';
      params.push(req.query.status);
    }
    if (req.query.eo_profile_id) {
      query += params.length ? ' AND' : ' WHERE';
      query += ' eo_profile_id = ?';
      params.push(req.query.eo_profile_id);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[events/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Event tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[events/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/events/:id/my-ticket-count
router.get('/:id/my-ticket-count', authenticateToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    const [ticketTypeRows] = await pool.query(
      'SELECT id FROM ticket_types WHERE event_id = ?',
      [eventId]
    );

    const counts = {};
    for (const row of ticketTypeRows) {
      counts[row.id] = 0;
    }

    const [ownedRows] = await pool.query(
      `SELECT t.ticket_type_id,
              COALESCE(SUM(
                CASE
                  WHEN COALESCE(tt.is_bundle, 0) = 1 THEN 1
                  ELSE COALESCE(t.quantity, 1)
                END
              ), 0) AS total
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       WHERE tt.event_id = ?
         AND t.user_id = ?
         AND o.status = 'PAID'
         AND t.status NOT IN ('CANCELLED', 'TRANSFERRED')
       GROUP BY t.ticket_type_id`,
      [eventId, userId]
    );

    for (const row of ownedRows) {
      counts[row.ticket_type_id] = Number(row.total || 0);
    }

    res.json(counts);
  } catch (err) {
    console.error('[events/my-ticket-count]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/events/:id/custom-form-fields
router.get('/:id/custom-form-fields', async (req, res) => {
  try {
    const fields = await getEventCustomFormFields(pool, req.params.id);
    res.json(fields.map((field) => ({
      id: field.id,
      event_id: field.event_id,
      label: field.label,
      field_type: field.field_type,
      options: field.options,
      is_required: field.is_required ? 1 : 0,
      applies_to: field.applies_to,
      sort_order: field.sort_order,
    })));
  } catch (err) {
    console.error('[events/custom-form/list]', err);
    res.status(500).json({ error: 'Gagal memuat custom form fields.' });
  }
});

// POST /api/events/:id/custom-form-fields
router.post('/:id/custom-form-fields', authenticateToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    await assertCanManageEvent(req, eventId);

    if (await eventHasPaidTicketSales(pool, eventId)) {
      return res.status(400).json({ error: 'Form tidak bisa diubah karena sudah ada tiket terjual.' });
    }

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM custom_form_fields WHERE event_id = ?',
      [eventId]
    );
    if (Number(countRows[0]?.total || 0) >= 10) {
      return res.status(400).json({ error: 'Maksimal 10 pertanyaan per event.' });
    }

    const payload = normalizeCustomFieldPayload(req.body || {});
    const fieldId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO custom_form_fields (id, event_id, label, field_type, options, is_required, applies_to, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fieldId,
        eventId,
        payload.label,
        payload.fieldType,
        payload.options ? JSON.stringify(payload.options) : null,
        payload.isRequired ? 1 : 0,
        payload.appliesTo,
        payload.sortOrder,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM custom_form_fields WHERE id = ?', [fieldId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[events/custom-form/create]', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Gagal membuat custom form field.' });
  }
});

// PUT /api/events/:id/custom-form-fields/:fieldId
router.put('/:id/custom-form-fields/:fieldId', authenticateToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    const fieldId = req.params.fieldId;

    await assertCanManageEvent(req, eventId);
    if (await eventHasPaidTicketSales(pool, eventId)) {
      return res.status(400).json({ error: 'Form tidak bisa diubah karena sudah ada tiket terjual.' });
    }

    const payload = normalizeCustomFieldPayload(req.body || {});
    await pool.query(
      `UPDATE custom_form_fields
       SET label = ?, field_type = ?, options = ?, is_required = ?, applies_to = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND event_id = ?`,
      [
        payload.label,
        payload.fieldType,
        payload.options ? JSON.stringify(payload.options) : null,
        payload.isRequired ? 1 : 0,
        payload.appliesTo,
        payload.sortOrder,
        fieldId,
        eventId,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM custom_form_fields WHERE id = ? AND event_id = ?', [fieldId, eventId]);
    if (!rows.length) return res.status(404).json({ error: 'Field tidak ditemukan.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[events/custom-form/update]', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Gagal mengubah custom form field.' });
  }
});

// DELETE /api/events/:id/custom-form-fields/:fieldId
router.delete('/:id/custom-form-fields/:fieldId', authenticateToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    const fieldId = req.params.fieldId;

    await assertCanManageEvent(req, eventId);
    if (await eventHasPaidTicketSales(pool, eventId)) {
      return res.status(400).json({ error: 'Form tidak bisa dihapus karena sudah ada tiket terjual.' });
    }

    const [result] = await pool.query(
      'DELETE FROM custom_form_fields WHERE id = ? AND event_id = ?',
      [fieldId, eventId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Field tidak ditemukan.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[events/custom-form/delete]', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Gagal menghapus custom form field.' });
  }
});

// GET /api/events/:id/resale-listings
router.get('/:id/resale-listings', async (req, res) => {
  try {
    const query = `
      SELECT rl.*, t.ticket_type_id 
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE tt.event_id = ? AND rl.status = 'OPEN'
    `;
    const [rows] = await pool.query(query, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error('[events/resale-listings]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/events — create event
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { id, eo_profile_id, title, description, category, banner_image, location, location_url, start_date, end_date, status, is_resale_allowed } = req.body;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const eventId = id || `evt_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const resaleAllowed = is_resale_allowed ? 1 : 0;

    await pool.query(
      `INSERT INTO events (id, eo_profile_id, title, description, category, banner_image, location, location_url, start_date, end_date, status, is_resale_allowed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId, eo_profile_id, title, description, category, banner_image || null, location, location_url || null, start_date, end_date, status || 'DRAFT', resaleAllowed, now, now]
    );

    const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[events/create]', err);
    res.status(500).json({ error: 'Gagal membuat event' });
  }
});

// PUT /api/events/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const fields = [];
    const values = [];
    const allowed = ['title', 'description', 'category', 'banner_image', 'location', 'location_url', 'start_date', 'end_date', 'status', 'is_resale_allowed'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        let val = req.body[key];
        if (key === 'is_resale_allowed') val = val ? 1 : 0;
        values.push(val);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });

    fields.push('updated_at = ?');
    values.push(new Date().toISOString().slice(0, 19).replace('T', ' '));
    values.push(req.params.id);

    await pool.query(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('[events/update]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/events/:id/banner — upload banner image
router.post('/:id/banner', authenticateToken, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File banner wajib diupload' });
    }

    const bannerUrl = `/banner-image/${req.file.filename}`;

    await pool.query('UPDATE events SET banner_image = ?, updated_at = ? WHERE id = ?', [
      bannerUrl,
      new Date().toISOString().slice(0, 19).replace('T', ' '),
      req.params.id,
    ]);

    res.json({ banner_image: bannerUrl });
  } catch (err) {
    console.error('[events/banner]', err);
    res.status(500).json({ error: 'Gagal upload banner' });
  }
});

export default router;
