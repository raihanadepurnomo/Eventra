import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/eo-profiles
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM eo_profiles';
    const params = [];
    if (req.query.user_id) {
      query += ' WHERE user_id = ?';
      params.push(req.query.user_id);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[eoProfiles/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/eo-profiles/notify-approved
router.post('/notify-approved', async (req, res) => {
  try {
    const { eoProfileId, approved } = req.body;
    console.log(`[eoProfiles/notify-approved] EO ID: ${eoProfileId}, Approved: ${approved}`);
    res.json({ success: true, message: 'Notification logged locally' });
  } catch (err) {
    console.error('[eoProfiles/notify]', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/eo-profiles/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM eo_profiles WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'EO profile tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/eo-profiles
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { org_name, description, phone } = req.body;
    const id = `eo_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `INSERT INTO eo_profiles (id, user_id, org_name, description, phone, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, req.user.id, org_name, description || null, phone || null, now]
    );

    // Update user role to EO
    await pool.query('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', ['EO', now, req.user.id]);

    const [rows] = await pool.query('SELECT * FROM eo_profiles WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[eoProfiles/create]', err);
    res.status(500).json({ error: 'Gagal membuat profil EO' });
  }
});

// PUT /api/eo-profiles/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const fields = [];
    const values = [];
    const allowed = ['org_name', 'description', 'phone', 'status'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        // Only admin can change status
        if (key === 'status' && req.user.role !== 'SUPER_ADMIN') continue;
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    values.push(req.params.id);

    await pool.query(`UPDATE eo_profiles SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM eo_profiles WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
