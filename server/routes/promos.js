import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  buildOrderPricingContext,
  normalizePromoCode,
  validateAndComputePromo,
} from '../lib/checkoutPricing.js';

const router = Router();

function formatValidationResult(ok, payload = {}) {
  if (ok) return { valid: true, ...payload };
  return { valid: false, ...payload };
}

async function ensureEOEventAccess(conn, eventId, user) {
  if (user.role === 'SUPER_ADMIN') return true;

  const [rows] = await conn.query(
    `SELECT e.id
     FROM events e
     JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     WHERE e.id = ? AND ep.user_id = ?
     LIMIT 1`,
    [eventId, user.id]
  );

  return rows.length > 0;
}

router.post('/promos/validate', authenticateToken, async (req, res) => {
  let conn;
  try {
    const { code, event_id, items } = req.body;
    const promoCode = normalizePromoCode(code);
    if (!promoCode) {
      return res.json(formatValidationResult(false, { reason: 'Kode promo wajib diisi.' }));
    }
    if (!event_id) {
      return res.json(formatValidationResult(false, { reason: 'Event tidak valid.' }));
    }

    conn = await pool.getConnection();

    const pricingCtx = await buildOrderPricingContext(conn, items || [], req.user.id, false);
    const promoResult = await validateAndComputePromo(conn, {
      promoCode,
      eventId: event_id,
      userId: req.user.id,
      normalizedItems: pricingCtx.normalizedItems,
      subtotal: pricingCtx.subtotal,
      lockPromo: false,
    });

    return res.json(formatValidationResult(true, {
      code: promoCode,
      description: promoResult.message,
      discountAmount: promoResult.discountAmount,
      subtotal: pricingCtx.subtotal,
    }));
  } catch (err) {
    return res.json(formatValidationResult(false, {
      reason: err?.message || 'Kode promo tidak valid.',
    }));
  } finally {
    if (conn) conn.release();
  }
});

router.get('/eo/events/:eventId/promos', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  let conn;
  try {
    const { eventId } = req.params;
    conn = await pool.getConnection();

    const canAccess = await ensureEOEventAccess(conn, eventId, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'Akses ditolak untuk event ini.' });
    }

    const [rows] = await conn.query(
      `SELECT * FROM promo_codes WHERE event_id = ? ORDER BY created_at DESC`,
      [eventId]
    );

    res.json(rows);
  } catch (err) {
    console.error('[promos/list]', err);
    res.status(500).json({ error: 'Gagal mengambil promo code' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/eo/events/:eventId/promos', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  let conn;
  try {
    const { eventId } = req.params;
    conn = await pool.getConnection();

    const canAccess = await ensureEOEventAccess(conn, eventId, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'Akses ditolak untuk event ini.' });
    }

    const code = normalizePromoCode(req.body.code);
    if (!/^[A-Z0-9]+$/.test(code)) {
      return res.status(400).json({ error: 'Kode promo hanya boleh huruf kapital dan angka tanpa spasi.' });
    }

    const promoId = req.body.id || crypto.randomUUID();
    const appliesTo = Array.isArray(req.body.applies_to) && req.body.applies_to.length > 0
      ? JSON.stringify(req.body.applies_to)
      : null;

    await conn.query(
      `INSERT INTO promo_codes (
         id, event_id, code, description, discount_type, discount_value,
         min_purchase, max_discount, quota, used_count, max_per_user,
         applies_to, start_date, end_date, is_active, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NOW())`,
      [
        promoId,
        eventId,
        code,
        req.body.description || null,
        req.body.discount_type,
        Number(req.body.discount_value || 0),
        Number(req.body.min_purchase || 0),
        req.body.max_discount !== undefined && req.body.max_discount !== null && req.body.max_discount !== ''
          ? Number(req.body.max_discount)
          : null,
        req.body.quota !== undefined && req.body.quota !== null && req.body.quota !== ''
          ? Number(req.body.quota)
          : null,
        Math.max(1, Number(req.body.max_per_user || 1)),
        appliesTo,
        req.body.start_date || null,
        req.body.end_date || null,
        req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0),
      ]
    );

    const [rows] = await conn.query('SELECT * FROM promo_codes WHERE id = ?', [promoId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[promos/create]', err);
    if (String(err?.message || '').includes('Duplicate entry')) {
      return res.status(400).json({ error: 'Kode promo untuk event ini sudah ada.' });
    }
    res.status(500).json({ error: 'Gagal membuat promo code' });
  } finally {
    if (conn) conn.release();
  }
});

router.put('/eo/events/:eventId/promos/:id', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  let conn;
  try {
    const { eventId, id } = req.params;
    conn = await pool.getConnection();

    const canAccess = await ensureEOEventAccess(conn, eventId, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'Akses ditolak untuk event ini.' });
    }

    const fields = [];
    const values = [];
    const allowed = [
      'description',
      'discount_type',
      'discount_value',
      'min_purchase',
      'max_discount',
      'quota',
      'max_per_user',
      'start_date',
      'end_date',
      'is_active',
    ];

    if (req.body.code !== undefined) {
      const code = normalizePromoCode(req.body.code);
      if (!/^[A-Z0-9]+$/.test(code)) {
        return res.status(400).json({ error: 'Kode promo hanya boleh huruf kapital dan angka tanpa spasi.' });
      }
      fields.push('code = ?');
      values.push(code);
    }

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        if (key === 'discount_value' || key === 'min_purchase' || key === 'max_per_user') {
          values.push(Number(req.body[key] || 0));
        } else if (key === 'max_discount' || key === 'quota') {
          const val = req.body[key];
          values.push(val === '' || val === null ? null : Number(val));
        } else if (key === 'is_active') {
          values.push(req.body[key] ? 1 : 0);
        } else {
          values.push(req.body[key]);
        }
      }
    }

    if (req.body.applies_to !== undefined) {
      const appliesTo = Array.isArray(req.body.applies_to) && req.body.applies_to.length > 0
        ? JSON.stringify(req.body.applies_to)
        : null;
      fields.push('applies_to = ?');
      values.push(appliesTo);
    }

    if (!fields.length) {
      return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    }

    values.push(id, eventId);
    await conn.query(
      `UPDATE promo_codes SET ${fields.join(', ')} WHERE id = ? AND event_id = ?`,
      values
    );

    const [rows] = await conn.query('SELECT * FROM promo_codes WHERE id = ? AND event_id = ?', [id, eventId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Promo tidak ditemukan' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[promos/update]', err);
    res.status(500).json({ error: 'Gagal mengupdate promo code' });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/eo/events/:eventId/promos/:id', authenticateToken, requireRole('EO', 'SUPER_ADMIN'), async (req, res) => {
  let conn;
  try {
    const { eventId, id } = req.params;
    conn = await pool.getConnection();

    const canAccess = await ensureEOEventAccess(conn, eventId, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'Akses ditolak untuk event ini.' });
    }

    await conn.query(
      `UPDATE promo_codes SET is_active = 0 WHERE id = ? AND event_id = ?`,
      [id, eventId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[promos/delete]', err);
    res.status(500).json({ error: 'Gagal menonaktifkan promo code' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
