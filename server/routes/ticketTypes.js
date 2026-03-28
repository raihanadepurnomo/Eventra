import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { enrichTicketTypeWithActivePricing } from '../lib/checkoutPricing.js';

const router = Router();

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
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { id, event_id, name, description, price, quota, sold, max_per_order, max_per_account, sale_start_date, sale_end_date } = req.body;
    const ttId = id || `tt_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;

    await pool.query(
      `INSERT INTO ticket_types (id, event_id, name, description, price, quota, sold, max_per_order, max_per_account, sale_start_date, sale_end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ttId, event_id, name, description || null, price ?? 0, quota || 100, sold || 0, max_per_order || 5, max_per_account ?? 0, sale_start_date, sale_end_date]
    );

    const [rows] = await pool.query('SELECT * FROM ticket_types WHERE id = ?', [ttId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[ticketTypes/create]', err);
    res.status(500).json({ error: 'Gagal membuat ticket type' });
  }
});

// PUT /api/ticket-types/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const fields = [];
    const values = [];
    const allowed = ['name', 'description', 'price', 'quota', 'sold', 'max_per_order', 'max_per_account', 'sale_start_date', 'sale_end_date'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    values.push(req.params.id);

    await pool.query(`UPDATE ticket_types SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM ticket_types WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
