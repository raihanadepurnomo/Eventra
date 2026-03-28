import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/tickets
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM tickets';
    const conditions = [];
    const params = [];

    if (req.query.user_id) {
      conditions.push('user_id = ?');
      params.push(req.query.user_id);
    }
    if (req.query.qr_code) {
      conditions.push('qr_code = ?');
      params.push(req.query.qr_code);
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

// GET /api/tickets/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
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
    const { id, order_id, user_id, ticket_type_id, qr_code, status, quantity, attendee_details, order_item_id } = req.body;
    const ticketId = id || `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const attendeeJson = attendee_details ? JSON.stringify(attendee_details) : null;

    await pool.query(
      `INSERT INTO tickets (id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at, quantity, attendee_details, order_item_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [ticketId, order_id, user_id || req.user.id, ticket_type_id, qr_code || crypto.randomUUID(), status || 'ACTIVE', now, quantity || 1, attendeeJson, order_item_id]
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
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
