import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticateToken, requireVerifiedEmail } from '../middleware/auth.js';

const router = Router();

// GET /api/eo/balance
router.get('/balance', authenticateToken, async (req, res) => {
  console.log(`[eoAuth/balance] Request from user: ${req.user?.id}`);
  try {
    const userId = req.user.id;
    
    // 1. Get EO profile ID
    const [profiles] = await pool.query('SELECT id FROM eo_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(403).json({ error: 'EO profile not found' });
    const eoProfileId = profiles[0].id;

    const [revRes] = await pool.query(`
      SELECT 
        IFNULL(SUM(oi.subtotal), 0) as totalRevenue,
        IFNULL(SUM(CASE 
          WHEN t.status IN ('USED', 'TRANSFERRED') OR e.start_date < CURRENT_DATE() 
          THEN (oi.subtotal / oi.quantity)
          ELSE 0 
        END), 0) as withdrawableRevenue
      FROM order_items oi
      JOIN tickets t ON oi.id = t.order_item_id
      JOIN orders o ON oi.order_id = o.id
      JOIN ticket_types tt ON oi.ticket_type_id = tt.id
      JOIN events e ON tt.event_id = e.id
      WHERE e.eo_profile_id = ? 
        AND o.status = 'PAID'
    `, [eoProfileId]);
    
    const totalEarned = Number(revRes[0].totalRevenue);
    const withdrawableRevenue = Number(revRes[0].withdrawableRevenue);
    
    console.log(`[eoAuth/balance] EO: ${eoProfileId}, Earned: ${totalEarned}, Withdrawable: ${withdrawableRevenue}`);

    // 3. Get Withdrawal status from seller_balances (recorded withdrawals)
    const [balances] = await pool.query('SELECT * FROM seller_balances WHERE user_id = ?', [userId]);
    let balanceRecord = balances[0];
    
    if (!balanceRecord) {
      console.log(`[eoAuth/balance] Creating new balance record for user: ${userId}`);
      const id = `bal_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
      await pool.query('INSERT INTO seller_balances (id, user_id, balance, total_earned, total_withdrawn) VALUES (?, ?, 0, 0, 0)', [id, userId]);
      balanceRecord = { id, user_id: userId, balance: 0, total_earned: 0, total_withdrawn: 0 };
    }

    const withdrawn = Number(balanceRecord.total_withdrawn || 0);
    const availableBalance = Math.max(0, withdrawableRevenue - withdrawn);

    console.log(`[eoAuth/balance] Final - Earned: ${totalEarned}, Withdrawable: ${withdrawableRevenue}, Withdrawn: ${withdrawn}, Avail: ${availableBalance}`);

    res.json({
      availableBalance,
      totalEarned: totalEarned,
      totalWithdrawn: withdrawn,
      balanceId: balanceRecord.id
    });
  } catch (err) {
    console.error('CRITICAL: [eoAuth/balance] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// GET /api/eo/withdrawals
router.get('/withdrawals', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[eoAuth/withdrawals]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/eo/withdraw
router.post('/withdraw', authenticateToken, requireVerifiedEmail, async (req, res) => {
  try {
    const { amount, bank_name, account_number, account_name, balance_id } = req.body;
    if (amount < 50000) return res.status(400).json({ error: 'Minimal pencairan Rp 50.000' });

    // Cek pending withdrawal
    const [pending] = await pool.query(`SELECT id FROM withdrawals WHERE user_id = ? AND status IN ('PENDING', 'PROCESSING')`, [req.user.id]);
    if (pending.length > 0) return res.status(400).json({ error: 'Masih ada permintaan pencairan yang sedang diproses' });

    // Validate balance again
    const userId = req.user.id;
    const [profiles] = await pool.query('SELECT id FROM eo_profiles WHERE user_id = ?', [userId]);
    const eoProfileId = profiles[0].id;
    const [revRes] = await pool.query(`
      SELECT IFNULL(SUM(CASE 
        WHEN t.status IN ('USED', 'TRANSFERRED') OR e.start_date < CURRENT_DATE() 
        THEN (oi.subtotal / oi.quantity)
        ELSE 0 
      END), 0) as withdrawableRevenue
      FROM order_items oi
      JOIN tickets t ON oi.id = t.order_item_id
      JOIN orders o ON oi.order_id = o.id
      JOIN ticket_types tt ON oi.ticket_type_id = tt.id
      JOIN events e ON tt.event_id = e.id
      WHERE e.eo_profile_id = ? 
        AND o.status = 'PAID'
    `, [eoProfileId]);
    
    const withdrawableRevenue = Number(revRes[0].withdrawableRevenue);
    console.log(`[eoAuth/withdraw] EO: ${eoProfileId}, Withdrawable: ${withdrawableRevenue}`);
    const [balances] = await pool.query('SELECT total_withdrawn FROM seller_balances WHERE user_id = ?', [userId]);
    const totalWithdrawn = balances[0]?.total_withdrawn || 0;
    const availableBalance = Math.max(0, withdrawableRevenue - totalWithdrawn);

    if (amount > availableBalance) {
      return res.status(400).json({ error: 'Saldo tidak mencukupi' });
    }

    const wdId = `wd_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    
    // Transactional update
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // We increment total_withdrawn in seller_balances
      // Wait, should we? In admin payout update, we might increment it again or subtract balance.
      // Let's keep it consistent: total_withdrawn is incremented ONLY when COMPLETED.
      // Wait, user resale logic: updates balance immediately.
      // For EO, it depends on how we calculate it. 
      // If balance is dynamic, we should track 'withdraw_pending' if we want.
      // Actually, simple way: only allow ONE active withdrawal.
      
      await connection.query(
        `INSERT INTO withdrawals (id, seller_balance_id, user_id, amount, bank_name, account_number, account_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [wdId, balance_id, req.user.id, amount, bank_name, account_number, account_name]
      );

      await connection.commit();
      res.json({ success: true, id: wdId });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('[eoAuth/withdraw]', err);
    res.status(500).json({ error: 'Gagal mengajukan pencairan' });
  }
});

export default router;
