import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../db.js';
dotenv.config({ path: '../../.env' });

const JWT_SECRET = process.env.JWT_SECRET || 'eventra-secret-key-change-me';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'Token tidak valid atau expired' });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch {
      // ignore invalid token
    }
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak' });
    }
    next();
  };
}

export async function requireVerifiedEmail(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  try {
    const [rows] = await pool.query(
      'SELECT email, is_email_verified FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'User tidak ditemukan' });
    }

    const user = rows[0];
    if (!user.is_email_verified) {
      return res.status(403).json({
        error: 'Email belum terverifikasi. Verifikasi email terlebih dahulu untuk melakukan transaksi.',
        verify_required: true,
        email: user.email,
      });
    }

    return next();
  } catch (err) {
    console.error('[auth/requireVerifiedEmail]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
