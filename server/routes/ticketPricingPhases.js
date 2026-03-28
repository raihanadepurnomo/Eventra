import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

async function canManageTicketType(conn, ticketTypeId, user) {
  if (user.role === 'SUPER_ADMIN') return true;

  const [rows] = await conn.query(
    `SELECT tt.id
     FROM ticket_types tt
     JOIN events e ON e.id = tt.event_id
     JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     WHERE tt.id = ? AND ep.user_id = ?
     LIMIT 1`,
    [ticketTypeId, user.id]
  );

  return rows.length > 0;
}

router.get('/', async (req, res) => {
  try {
    if (req.query.ticket_type_id) {
      const [rows] = await pool.query(
        `SELECT *
         FROM ticket_pricing_phases
         WHERE ticket_type_id = ?
         ORDER BY sort_order ASC, created_at ASC`,
        [req.query.ticket_type_id]
      );
      return res.json(rows);
    }

    if (req.query.event_id) {
      const [rows] = await pool.query(
        `SELECT tpp.*
         FROM ticket_pricing_phases tpp
         JOIN ticket_types tt ON tt.id = tpp.ticket_type_id
         WHERE tt.event_id = ?
         ORDER BY tpp.ticket_type_id ASC, tpp.sort_order ASC, tpp.created_at ASC`,
        [req.query.event_id]
      );
      return res.json(rows);
    }

    const [rows] = await pool.query('SELECT * FROM ticket_pricing_phases ORDER BY created_at DESC LIMIT 200');
    return res.json(rows);
  } catch (err) {
    console.error('[ticket-pricing-phases/list]', err);
    res.status(500).json({ error: 'Gagal mengambil pricing phases' });
  }
});

router.post('/', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { id, ticket_type_id, phase_name, price, quota, start_date, end_date, sort_order } = req.body;

    if (!ticket_type_id || !phase_name) {
      return res.status(400).json({ error: 'ticket_type_id dan phase_name wajib diisi' });
    }

    const canManage = await canManageTicketType(conn, ticket_type_id, req.user);
    if (!canManage) {
      return res.status(403).json({ error: 'Akses ditolak untuk ticket type ini.' });
    }

    const phaseId = id || crypto.randomUUID();

    await conn.query(
      `INSERT INTO ticket_pricing_phases (
        id, ticket_type_id, phase_name, price, quota, quota_sold, start_date, end_date, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
      [
        phaseId,
        ticket_type_id,
        phase_name,
        Number(price || 0),
        quota === '' || quota === null || quota === undefined ? null : Number(quota),
        start_date || null,
        end_date || null,
        Number(sort_order || 0),
      ]
    );

    const [rows] = await conn.query('SELECT * FROM ticket_pricing_phases WHERE id = ?', [phaseId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[ticket-pricing-phases/create]', err);
    res.status(500).json({ error: 'Gagal membuat pricing phase' });
  } finally {
    if (conn) conn.release();
  }
});

router.put('/:id', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const phaseId = req.params.id;

    const [rows] = await conn.query('SELECT * FROM ticket_pricing_phases WHERE id = ?', [phaseId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Pricing phase tidak ditemukan' });
    }
    const existing = rows[0];

    const canManage = await canManageTicketType(conn, existing.ticket_type_id, req.user);
    if (!canManage) {
      return res.status(403).json({ error: 'Akses ditolak untuk pricing phase ini.' });
    }

    const fields = [];
    const values = [];
    const allowed = ['phase_name', 'price', 'quota', 'start_date', 'end_date', 'sort_order'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        if (key === 'price' || key === 'sort_order') {
          values.push(Number(req.body[key] || 0));
        } else if (key === 'quota') {
          const val = req.body[key];
          values.push(val === '' || val === null ? null : Number(val));
        } else {
          values.push(req.body[key] || null);
        }
      }
    }

    if (!fields.length) {
      return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    }

    values.push(phaseId);
    await conn.query(`UPDATE ticket_pricing_phases SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updatedRows] = await conn.query('SELECT * FROM ticket_pricing_phases WHERE id = ?', [phaseId]);
    res.json(updatedRows[0]);
  } catch (err) {
    console.error('[ticket-pricing-phases/update]', err);
    res.status(500).json({ error: 'Gagal mengupdate pricing phase' });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/:id', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const phaseId = req.params.id;

    const [rows] = await conn.query('SELECT * FROM ticket_pricing_phases WHERE id = ?', [phaseId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Pricing phase tidak ditemukan' });
    }
    const existing = rows[0];

    const canManage = await canManageTicketType(conn, existing.ticket_type_id, req.user);
    if (!canManage) {
      return res.status(403).json({ error: 'Akses ditolak untuk pricing phase ini.' });
    }

    await conn.query('DELETE FROM ticket_pricing_phases WHERE id = ?', [phaseId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[ticket-pricing-phases/delete]', err);
    res.status(500).json({ error: 'Gagal menghapus pricing phase' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
