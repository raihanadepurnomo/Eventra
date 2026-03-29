import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeQuota(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : NaN;
}

function hasOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

async function assertNoPhaseOverlap(conn, {
  ticketTypeId,
  startDate,
  endDate,
  excludePhaseId = null,
}) {
  const params = [ticketTypeId];
  let query =
    `SELECT id, phase_name, start_date, end_date
     FROM ticket_pricing_phases
     WHERE ticket_type_id = ?`;

  if (excludePhaseId) {
    query += ' AND id <> ?';
    params.push(excludePhaseId);
  }

  const [rows] = await conn.query(query, params);

  for (const row of rows) {
    const rowStart = toDate(row.start_date);
    const rowEnd = toDate(row.end_date);

    // Legacy data guard: old rows without proper windows should block inserts/updates until fixed.
    if (!rowStart || !rowEnd) {
      throw new Error(`Fase lama "${row.phase_name || row.id}" belum memiliki rentang waktu valid.`);
    }

    if (hasOverlap(startDate, endDate, rowStart, rowEnd)) {
      throw new Error(`Rentang waktu bertabrakan dengan fase "${row.phase_name || row.id}".`);
    }
  }
}

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
         ORDER BY start_date ASC, created_at ASC`,
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
         ORDER BY tpp.ticket_type_id ASC, tpp.start_date ASC, tpp.created_at ASC`,
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
    const { id, ticket_type_id, phase_name, price, quota, start_date, end_date } = req.body;

    if (!ticket_type_id || !phase_name) {
      return res.status(400).json({ error: 'ticket_type_id dan phase_name wajib diisi' });
    }

    const normalizedName = String(phase_name || '').trim();
    if (!normalizedName) {
      return res.status(400).json({ error: 'Nama fase wajib diisi.' });
    }

    const normalizedPrice = normalizePrice(price);
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
      return res.status(400).json({ error: 'Harga fase tidak valid.' });
    }

    const normalizedQuota = normalizeQuota(quota);
    if (Number.isNaN(normalizedQuota)) {
      return res.status(400).json({ error: 'Kuota fase tidak valid.' });
    }

    const startDate = toDate(start_date);
    const endDate = toDate(end_date);
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Tanggal mulai dan selesai fase wajib diisi.' });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ error: 'Tanggal mulai fase harus lebih awal dari tanggal selesai.' });
    }

    const canManage = await canManageTicketType(conn, ticket_type_id, req.user);
    if (!canManage) {
      return res.status(403).json({ error: 'Akses ditolak untuk ticket type ini.' });
    }

    try {
      await assertNoPhaseOverlap(conn, {
        ticketTypeId: ticket_type_id,
        startDate,
        endDate,
      });
    } catch (overlapErr) {
      return res.status(400).json({ error: overlapErr.message });
    }

    const phaseId = id || crypto.randomUUID();

    await conn.query(
      `INSERT INTO ticket_pricing_phases (
        id, ticket_type_id, phase_name, price, quota, quota_sold, start_date, end_date, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
      [
        phaseId,
        ticket_type_id,
        normalizedName,
        normalizedPrice,
        normalizedQuota,
        start_date,
        end_date,
        0,
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

    const nextPhaseName = req.body.phase_name !== undefined
      ? String(req.body.phase_name || '').trim()
      : String(existing.phase_name || '').trim();
    const nextPriceRaw = req.body.price !== undefined ? req.body.price : existing.price;
    const nextQuotaRaw = req.body.quota !== undefined ? req.body.quota : existing.quota;
    const nextStartRaw = req.body.start_date !== undefined ? req.body.start_date : existing.start_date;
    const nextEndRaw = req.body.end_date !== undefined ? req.body.end_date : existing.end_date;

    if (!nextPhaseName) {
      return res.status(400).json({ error: 'Nama fase wajib diisi.' });
    }

    const nextPrice = normalizePrice(nextPriceRaw);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      return res.status(400).json({ error: 'Harga fase tidak valid.' });
    }

    const nextQuota = normalizeQuota(nextQuotaRaw);
    if (Number.isNaN(nextQuota)) {
      return res.status(400).json({ error: 'Kuota fase tidak valid.' });
    }

    const nextStart = toDate(nextStartRaw);
    const nextEnd = toDate(nextEndRaw);
    if (!nextStart || !nextEnd) {
      return res.status(400).json({ error: 'Tanggal mulai dan selesai fase wajib diisi.' });
    }
    if (nextStart >= nextEnd) {
      return res.status(400).json({ error: 'Tanggal mulai fase harus lebih awal dari tanggal selesai.' });
    }

    try {
      await assertNoPhaseOverlap(conn, {
        ticketTypeId: existing.ticket_type_id,
        startDate: nextStart,
        endDate: nextEnd,
        excludePhaseId: phaseId,
      });
    } catch (overlapErr) {
      return res.status(400).json({ error: overlapErr.message });
    }

    await conn.query(
      `UPDATE ticket_pricing_phases
       SET phase_name = ?, price = ?, quota = ?, start_date = ?, end_date = ?
       WHERE id = ?`,
      [
        nextPhaseName,
        nextPrice,
        nextQuota,
        nextStartRaw,
        nextEndRaw,
        phaseId,
      ]
    );

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
