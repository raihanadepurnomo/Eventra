import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/resale-listings
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM resale_listings';
    const conditions = [];
    const params = [];

    if (req.query.ticket_id) {
      conditions.push('ticket_id = ?');
      params.push(req.query.ticket_id);
    }
    if (req.query.status) {
      conditions.push('status = ?');
      params.push(req.query.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/resale-listings
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { ticket_id, asking_price } = req.body;
    const id = `rl_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `INSERT INTO resale_listings (id, ticket_id, asking_price, status, created_at) VALUES (?, ?, ?, 'OPEN', ?)`,
      [id, ticket_id, asking_price, now]
    );

    const [rows] = await pool.query('SELECT * FROM resale_listings WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/resale-listings/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const fields = [];
    const values = [];
    const allowed = ['asking_price', 'status'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    values.push(req.params.id);

    await pool.query(`UPDATE resale_listings SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM resale_listings WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
