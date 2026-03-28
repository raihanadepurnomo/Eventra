import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'eventra-secret-key-change-me';
const SUPER_ADMIN_EMAIL = process.env.VITE_SUPER_ADMIN_EMAIL || '';
const getFrontendUrl = () => process.env.VITE_FRONTEND_URL || 'http://localhost:5173';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ─── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role: requestedRole } = req.body;

    if (!email || !password || !phone) {
      return res.status(400).json({ error: 'Email, password, dan nomor HP wajib diisi' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    // Check if email exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    const id = `user_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const role = SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL 
      ? 'SUPER_ADMIN' 
      : (requestedRole === 'EO' ? 'EO' : 'BUYER');

    await pool.query(
      `INSERT INTO users (id, email, name, role, created_at, updated_at, email_verified, password_hash, phone_verified, phone)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?)`,
      [id, email, name || email.split('@')[0], role, now, now, passwordHash, phone]
    );

    const user = { id, email, name: name || email.split('@')[0], role, phone, created_at: now };
    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Gagal mendaftar' });
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const user = rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Akun ini terdaftar via Google. Gunakan login Google.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Gagal login' });
  }
});

// ─── Google OAuth: Redirect to Google ──────────────────────────────────────────
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google OAuth belum dikonfigurasi' });
  }

  const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/google/callback`;
  const scope = encodeURIComponent('openid email profile');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=select_account`;
  res.redirect(url);
});

// ─── Google OAuth: Callback ────────────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect(`${getFrontendUrl()}/login?error=no_code`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.redirect(`${getFrontendUrl()}/login?error=token_failed`);
    }

    // Get user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // Find or create user
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [userInfo.email]);
    let user;

    if (existing.length > 0) {
      user = existing[0];
      // Update image/name if not set
      if (!user.image && userInfo.picture) {
        await pool.query('UPDATE users SET image = ?, updated_at = ? WHERE id = ?', [
          userInfo.picture,
          new Date().toISOString().slice(0, 19).replace('T', ' '),
          user.id,
        ]);
        user.image = userInfo.picture;
      }
    } else {
      const id = `user_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const role = SUPER_ADMIN_EMAIL && userInfo.email === SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN' : 'BUYER';

      await pool.query(
        `INSERT INTO users (id, email, name, image, role, created_at, updated_at, email_verified, phone_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [id, userInfo.email, userInfo.name, userInfo.picture, role, now, now]
      );

      user = { id, email: userInfo.email, name: userInfo.name, image: userInfo.picture, role, created_at: now };
    }

    const token = generateToken(user);
    // Redirect back to frontend with token
    const frontendUrl = getFrontendUrl();
    console.log(`[auth/google/callback] Redirecting to: ${frontendUrl}/auth/callback`);
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('[auth/google/callback]', err);
    res.redirect(`${getFrontendUrl()}/login?error=google_failed`);
  }
});

// ─── Get current user ──────────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.name, u.image, u.role, u.created_at, u.updated_at, u.display_name, u.avatar_url, u.phone, 
              u.username, u.username_changed_at, u.is_profile_public, s.bio, s.instagram_handle
       FROM users u
       LEFT JOIN seat_social_profiles s ON u.id = s.user_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
