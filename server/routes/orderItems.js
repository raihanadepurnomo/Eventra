import { Router } from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/order-items
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT oi.*, tpp.phase_name AS active_phase_name
      FROM order_items oi
      LEFT JOIN ticket_pricing_phases tpp ON tpp.id = oi.active_phase_id
    `;
    const params = [];
    if (req.query.order_id) {
      query += ' WHERE oi.order_id = ?';
      params.push(req.query.order_id);
    }
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
