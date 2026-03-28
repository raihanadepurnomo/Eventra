import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Ensure user-photo directory exists
const photoDir = path.join(process.cwd(), '..', 'public', 'user-photo');
if (!fs.existsSync(photoDir)) {
  fs.mkdirSync(photoDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const timestamp = Date.now();
    cb(null, `avatar_${req.params.id}_${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Hanya file JPG, JPEG, PNG yang diizinkan'));
  },
});

// GET /api/users — list all (admin only)
router.get('/', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.name, u.image, u.role, u.created_at, u.updated_at, u.display_name, u.avatar_url, u.phone, 
              u.username, u.username_changed_at, u.is_profile_public, s.bio, s.instagram_handle
       FROM users u
       LEFT JOIN seat_social_profiles s ON u.id = s.user_id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[users/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/username/check
router.get('/username/check', async (req, res) => {
  try {
    const { username, current_user_id } = req.query;
    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });

    const regex = /^[a-z0-9_]{3,20}$/;
    if (!regex.test(username)) {
      return res.json({ available: false, reason: 'Format tidak valid (hanya huruf kecil, angka, _, 3-20 karakter)' });
    }
    if (/^[0-9_]/.test(username)) {
      return res.json({ available: false, reason: 'Tidak boleh diawali angka atau underscore' });
    }

    const reserved = ['admin', 'superadmin', 'eo', 'event', 'events', 'api', 'dashboard', 'settings', 'profile', 'login', 'logout', 'register', 'help', 'support', 'about', 'contact', 'home', 'explore'];
    if (reserved.includes(username)) {
      return res.json({ available: false, reason: 'Nama tidak boleh digunakan' });
    }

    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (rows.length > 0) {
      if (current_user_id && rows[0].id === current_user_id) {
        return res.json({ available: true, reason: null });
      }
      return res.json({ available: false, reason: 'Sudah dipakai' });
    }

    res.json({ available: true, reason: null });
  } catch (err) {
    console.error('[users/username/check]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/username
router.put('/username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });

    const regex = /^[a-z0-9_]{3,20}$/;
    if (!regex.test(username) || /^[0-9_]/.test(username)) {
      return res.status(400).json({ error: 'Format username tidak valid' });
    }

    const reserved = ['admin', 'superadmin', 'eo', 'event', 'events', 'api', 'dashboard', 'settings', 'profile', 'login', 'logout', 'register', 'help', 'support', 'about', 'contact', 'home', 'explore'];
    if (reserved.includes(username)) {
      return res.status(400).json({ error: 'Username tidak boleh digunakan' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0 && existing[0].id !== req.user.id) {
       return res.status(400).json({ error: 'Username sudah dipakai' });
    }

    const [me] = await pool.query('SELECT username, username_changed_at FROM users WHERE id = ?', [req.user.id]);
    if (!me || me.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });

    if (me[0].username === username) {
       return res.json({ user: me[0] });
    }

    if (me[0].username_changed_at) {
       const lastChanged = new Date(me[0].username_changed_at);
       const now = new Date();
       const diffTime = Math.abs(now - lastChanged);
       const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
       if (diffDays <= 30) {
         return res.status(400).json({ error: `Username hanya bisa diganti 1x per 30 hari.` });
       }
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query('UPDATE users SET username = ?, username_changed_at = ? WHERE id = ?', [username, nowStr, req.user.id]);

    res.json({ user: { username, username_changed_at: nowStr } });
  } catch (err) {
    console.error('[users/username/update]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/profile/:username
router.get('/profile/:username', async (req, res) => {
  try {
     const [users] = await pool.query('SELECT id, username, name, image, is_profile_public FROM users WHERE username = ?', [req.params.username]);
     if (users.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
     const user = users[0];

     if (!user.is_profile_public) {
       return res.status(403).json({ error: 'Profil ini disembunyikan' });
     }

     const [profiles] = await pool.query('SELECT bio, instagram_handle FROM seat_social_profiles WHERE user_id = ?', [user.id]);
     const profile = profiles.length > 0 ? profiles[0] : null;

     let attendedEvents = [];
     if (profile) {
         const [events] = await pool.query(`
           SELECT DISTINCT e.id, e.title, e.banner_image, e.start_date, e.location as city 
           FROM tickets t
           JOIN ticket_types tt ON t.ticket_type_id = tt.id
           JOIN events e ON tt.event_id = e.id
           WHERE t.user_id = ? AND e.status != 'CANCELLED'
           ORDER BY e.start_date DESC
         `, [user.id]);
         attendedEvents = events.map(e => ({
            id: e.id,
            title: e.title,
            bannerImage: e.banner_image,
            startDate: e.start_date,
            city: e.city
         }));
     }

     res.json({
       user: {
         username: user.username,
         name: user.name,
         image: user.image,
         bio: profile ? profile.bio : null,
         instagramHandle: profile ? profile.instagram_handle : null,
         attendedEvents
       }
     });

  } catch (err) {
     console.error('[users/profile/get]', err);
     res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.name, u.image, u.role, u.created_at, u.updated_at, u.display_name, u.avatar_url, u.phone, 
              u.username, u.username_changed_at, u.is_profile_public, s.bio, s.instagram_handle
       FROM users u
       LEFT JOIN seat_social_profiles s ON u.id = s.user_id
       WHERE u.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[users/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // Users can only update themselves, admins can update anyone
    if (req.user.id !== req.params.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Akses ditolak' });
    }

    const fields = [];
    const values = [];
    const allowed = ['name', 'display_name', 'avatar_url', 'phone', 'role', 'image', 'is_profile_public'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        // Only admin can change role
        if (key === 'role' && req.user.role !== 'SUPER_ADMIN') continue;
        fields.push(`${key} = ?`);
        
        // Handle boolean parsing for is_profile_public
        if (key === 'is_profile_public') {
           values.push(req.body[key] ? 1 : 0);
        } else {
           values.push(req.body[key]);
        }
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString().slice(0, 19).replace('T', ' '));
      values.push(req.params.id);
      await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    }
    
    // Update seat_social_profiles
    if (req.body.bio !== undefined || req.body.instagram_handle !== undefined) {
       const [profiles] = await pool.query('SELECT id FROM seat_social_profiles WHERE user_id = ?', [req.params.id]);
       if (profiles.length === 0) {
          const newId = `ssp_${crypto.randomUUID().replace(/-/g, '').substring(0,12)}`;
          await pool.query(`INSERT INTO seat_social_profiles (id, user_id, bio, instagram_handle) VALUES (?, ?, ?, ?)`, 
            [newId, req.params.id, req.body.bio !== undefined ? req.body.bio : null, req.body.instagram_handle !== undefined ? req.body.instagram_handle : null]);
       } else {
          const pFields = [];
          const pVals = [];
          if (req.body.bio !== undefined) { pFields.push('bio = ?'); pVals.push(req.body.bio); }
          if (req.body.instagram_handle !== undefined) { pFields.push('instagram_handle = ?'); pVals.push(req.body.instagram_handle); }
          pVals.push(req.params.id);
          await pool.query(`UPDATE seat_social_profiles SET ${pFields.join(', ')} WHERE user_id = ?`, pVals);
       }
    }

    if (fields.length === 0 && req.body.bio === undefined && req.body.instagram_handle === undefined) {
       return res.status(400).json({ error: 'Tidak ada field yang diupdate' });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.name, u.image, u.role, u.created_at, u.updated_at, u.display_name, u.avatar_url, u.phone, 
              u.username, u.username_changed_at, u.is_profile_public, s.bio, s.instagram_handle
       FROM users u
       LEFT JOIN seat_social_profiles s ON u.id = s.user_id
       WHERE u.id = ?`,
       [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[users/update]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users/:id/avatar
router.post('/:id/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (req.user.id !== req.params.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Akses ditolak' });
    }
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

    const avatarUrl = `/user-photo/${req.file.filename}`;
    await pool.query('UPDATE users SET image = ? WHERE id = ?', [avatarUrl, req.params.id]);

    res.json({ image: avatarUrl });
  } catch (err) {
    console.error('[users/avatar]', err);
    res.status(500).json({ error: 'Gagal upload foto' });
  }
});

// PUT /api/users/:id/password
router.put('/:id/password', authenticateToken, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Akses ditolak' });
    }
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) return res.status(400).json({ error: 'Password lama dan baru wajib diisi' });

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });

    const isValid = await bcrypt.compare(old_password, rows[0].password_hash);
    if (!isValid) return res.status(400).json({ error: 'Password lama salah' });

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[users/password]', err);
    res.status(500).json({ error: 'Gagal update password' });
  }
});

export default router;
