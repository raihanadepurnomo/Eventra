import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

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
      `SELECT t.ticket_type_id, COALESCE(SUM(t.quantity), 0) AS total
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
