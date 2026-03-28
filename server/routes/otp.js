import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'eventra-secret-key-change-me';

const OTP_TYPES = new Set(['verify_email', 'reset_password']);

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Helper to limit OTP requests (3 per hour)
async function isRateLimited(userId, type) {
  const [rows] = await pool.query(
    'SELECT count(*) as count FROM otp_codes WHERE user_id = ? AND type = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)',
    [userId, type]
  );
  // 1 initial OTP + max 3 resend within one hour
  return Number(rows[0].count) >= 4;
}

async function sendOtpEmail(email, name, code, type) {
  const { sendEmail } = await import('../lib/mailer.js');
  let subject = '', html = '';
    
    if (type === 'verify_email') {
      subject = 'Kode Verifikasi Akun Eventra Kamu';
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Halo ${name},</h2>
          <p>Selamat datang di Eventra! 🎟️</p>
          <p>Masukkan kode berikut untuk memverifikasi akun kamu:</p>
          <div style="background: #f4f4f5; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <h1 style="font-size: 32px; letter-spacing: 8px; margin: 0; color: #0f172a;">${code}</h1>
          </div>
          <p>Kode berlaku selama 10 menit.</p>
          <p>Jika kamu tidak merasa meminta kode ini, abaikan email ini.</p>
          <br/><p>— Tim Eventra</p>
        </div>`;
    } else {
      subject = 'Reset Password Akun Eventra';
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Halo ${name},</h2>
          <p>Kami menerima permintaan untuk mereset password akun kamu.</p>
          <p>Masukkan kode berikut untuk melanjutkan:</p>
          <div style="background: #f4f4f5; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <h1 style="font-size: 32px; letter-spacing: 8px; margin: 0; color: #0f172a;">${code}</h1>
          </div>
          <p>Kode berlaku selama 10 menit.</p>
          <p>Jika kamu tidak merasa meminta reset password, segera amankan akun kamu dan abaikan email ini.</p>
          <br/><p>— Tim Eventra</p>
        </div>`;
    }
    
  await sendEmail({ to: email, subject, html });
}

function isValidOtpType(type) {
  return OTP_TYPES.has(type);
}

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code, type = 'verify_email' } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email dan OTP wajib diisi' });
    }
    if (!isValidOtpType(type)) {
      return res.status(400).json({ error: 'Tipe OTP tidak valid' });
    }
    
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    const user = users[0];

    const [otps] = await pool.query(
      'SELECT *, (expires_at > NOW()) AS not_expired FROM otp_codes WHERE user_id = ? AND code = ? AND type = ? AND is_used = FALSE ORDER BY created_at DESC LIMIT 1',
      [user.id, code, type]
    );

    if (otps.length === 0) {
      return res.status(400).json({ error: 'Kode OTP tidak valid' });
    }

    const otp = otps[0];
    if (!otp.not_expired) {
      return res.status(400).json({ error: 'Kode OTP sudah kadaluarsa' });
    }

    if (type === 'verify_email') {
      await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otp.id]);
      await pool.query('UPDATE users SET is_email_verified = TRUE, email_verified = 1 WHERE id = ?', [user.id]);
      const token = generateToken({ id: user.id, email: user.email, role: user.role });
      return res.json({ message: 'Email berhasil diverifikasi', token, user });
    }

    return res.json({ message: 'OTP valid. Silakan masukkan password baru.' });
  } catch (err) {
    console.error('[auth/verify-otp]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { email, type = 'verify_email' } = req.body;
    if (!email) return res.status(400).json({ error: 'Email wajib diisi' });
    if (!isValidOtpType(type)) {
      return res.status(400).json({ error: 'Tipe OTP tidak valid' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    const user = users[0];

    if (type === 'reset_password' && user.auth_provider !== 'email') {
      return res.status(400).json({ error: 'Akun Google tidak bisa reset password via OTP' });
    }

    if (await isRateLimited(user.id, type)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan OTP. Tunggu 1 jam.' });
    }

    const code = Array.from({length: 6}, () => Math.floor(Math.random() * 10)).join('');
    
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [user.id, code, type]
    );

    try {
      await sendOtpEmail(user.email, user.name || user.email.split('@')[0], code, type);
    } catch (mailErr) {
      await pool.query(
        'DELETE FROM otp_codes WHERE user_id = ? AND code = ? AND type = ? AND is_used = FALSE',
        [user.id, code, type]
      );
      console.error('[auth/resend-otp] mail failed:', mailErr);
      return res.status(502).json({
        error: 'OTP gagal dikirim. Periksa konfigurasi email Resend (domain/sender) lalu coba lagi.',
        detail: mailErr?.message || 'Unknown mail error',
      });
    }

    res.json({ message: 'OTP telah dikirim ulang' });
  } catch (err) {
    console.error('[auth/resend-otp]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email wajib diisi' });

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'Email tidak ditemukan' });
    const user = users[0];

    if (user.auth_provider !== 'email') {
      return res.status(400).json({ error: 'Akun ini menggunakan Google Login. Tidak dapat mereset password.' });
    }

    if (await isRateLimited(user.id, 'reset_password')) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Tunggu 1 jam.' });
    }

    const code = Array.from({length: 6}, () => Math.floor(Math.random() * 10)).join('');
    
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, type, expires_at) VALUES (?, ?, 'reset_password', DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [user.id, code]
    );

    try {
      await sendOtpEmail(user.email, user.name || user.email.split('@')[0], code, 'reset_password');
    } catch (mailErr) {
      await pool.query(
        "DELETE FROM otp_codes WHERE user_id = ? AND code = ? AND type = 'reset_password' AND is_used = FALSE",
        [user.id, code]
      );
      console.error('[auth/forgot-password] mail failed:', mailErr);
      return res.status(502).json({
        error: 'OTP reset gagal dikirim. Periksa konfigurasi email Resend (domain/sender) lalu coba lagi.',
        detail: mailErr?.message || 'Unknown mail error',
      });
    }

    res.json({ message: 'OTP untuk reset password telah dikirim' });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword, new_password: newPasswordSnake } = req.body;
    const nextPassword = newPassword || newPasswordSnake;

    if (!email || !code || !nextPassword) {
      return res.status(400).json({ error: 'Email, OTP, dan password baru wajib diisi' });
    }

    if (nextPassword.length < 8 || !/(?=.*[A-Za-z])(?=.*[0-9])/.test(nextPassword)) {
      return res.status(400).json({ error: 'Password minimal 8 karakter, mengandung huruf dan angka' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    const user = users[0];

    const [otps] = await pool.query(
      "SELECT *, (expires_at > NOW()) AS not_expired FROM otp_codes WHERE user_id = ? AND code = ? AND type = 'reset_password' AND is_used = FALSE ORDER BY created_at DESC LIMIT 1",
      [user.id, code]
    );

    // Technically frontend verifies first, but we re-verify to be safe
    if (otps.length === 0 || !otps[0].not_expired) {
      return res.status(400).json({ error: 'OTP tidak valid atau expired' });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otps[0].id]);
    
    res.json({ message: 'Password berhasil diubah. Silakan login.' });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
