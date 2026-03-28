import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  sendEOVerificationPendingEmail,
  sendEOVerificationApprovedEmail,
  sendEOVerificationRejectedEmail,
} from '../lib/transactionalEmails.js';

const router = Router();

const EO_REJECTION_REASON_TEMPLATES = {
  DOCS_INCOMPLETE: {
    label: 'Dokumen belum lengkap',
    description: 'Data atau dokumen wajib untuk verifikasi EO masih belum lengkap. Silakan lengkapi terlebih dahulu lalu ajukan kembali.',
  },
  DATA_MISMATCH: {
    label: 'Data tidak sesuai',
    description: 'Sebagian data yang diajukan tidak sesuai atau tidak valid. Silakan perbarui data EO agar sesuai.',
  },
  POLICY_VIOLATION: {
    label: 'Tidak memenuhi kebijakan platform',
    description: 'Pengajuan EO belum memenuhi kebijakan dan ketentuan Eventra saat ini.',
  },
  ACCOUNT_REVIEW: {
    label: 'Perlu peninjauan akun lebih lanjut',
    description: 'Akun membutuhkan peninjauan tambahan dari tim kami sebelum dapat diaktifkan kembali.',
  },
  OTHER: {
    label: 'Alasan operasional lainnya',
    description: 'Silakan lakukan pembaruan data EO dan ajukan kembali untuk ditinjau ulang.',
  },
};

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

    try {
      const [userRows] = await pool.query('SELECT email, name FROM users WHERE id = ? LIMIT 1', [req.user.id]);
      const user = userRows[0] || null;
      if (user?.email) {
        await sendEOVerificationPendingEmail({
          to: user.email,
          recipientName: user.name,
          orgName: org_name,
        });
      }
    } catch (mailErr) {
      console.error('[eoProfiles/create][notify-pending]', mailErr);
    }

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
    const [currentRows] = await pool.query(
      `SELECT ep.id, ep.user_id, ep.org_name, ep.status, u.email AS user_email, u.name AS user_name
       FROM eo_profiles ep
       LEFT JOIN users u ON u.id = ep.user_id
       WHERE ep.id = ?
       LIMIT 1`,
      [req.params.id]
    );

    if (currentRows.length === 0) {
      return res.status(404).json({ error: 'EO profile tidak ditemukan' });
    }

    const currentProfile = currentRows[0];
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

    const requestedStatus = req.body.status;
    const statusChangedByAdmin =
      requestedStatus !== undefined &&
      req.user.role === 'SUPER_ADMIN' &&
      requestedStatus !== currentProfile.status;

    if (statusChangedByAdmin && currentProfile.user_email) {
      try {
        if (requestedStatus === 'ACTIVE') {
          await sendEOVerificationApprovedEmail({
            to: currentProfile.user_email,
            recipientName: currentProfile.user_name,
            orgName: rows[0]?.org_name || currentProfile.org_name,
          });
        }

        if (requestedStatus === 'SUSPENDED') {
          const rejectionReasonCode = req.body.rejection_reason_code;
          const rejectionTemplate = EO_REJECTION_REASON_TEMPLATES[rejectionReasonCode] || EO_REJECTION_REASON_TEMPLATES.OTHER;

          await sendEOVerificationRejectedEmail({
            to: currentProfile.user_email,
            recipientName: currentProfile.user_name,
            orgName: rows[0]?.org_name || currentProfile.org_name,
            reasonTitle: rejectionTemplate.label,
            reasonDescription: rejectionTemplate.description,
          });
        }
      } catch (mailErr) {
        console.error('[eoProfiles/update][notify-status]', mailErr);
      }
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
