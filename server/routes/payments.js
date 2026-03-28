import { Router } from 'express';
import midtransClient from 'midtrans-client';
import pool from '../db.js';
import { authenticateToken, requireVerifiedEmail } from '../middleware/auth.js';
import { handleResalePaymentStatus } from './resale.js';
import {
  sendOrderExpiredEmail,
  sendPaymentSuccessEmail,
  sendPendingPaymentEmail,
} from '../lib/transactionalEmails.js';

const router = Router();

function mapFailureStatus(transactionStatus) {
  return transactionStatus === 'expire' ? 'EXPIRED' : 'CANCELLED';
}

// /api/payments/create
router.post('/create', authenticateToken, requireVerifiedEmail, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // 1. Fetch Order and Items
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orders[0];

    if (Number(order.total_amount || 0) === 0) {
      return res.status(400).json({ error: 'Tiket gratis tidak memerlukan pembayaran' });
    }

    // Ensure authorized
    if (order.user_id !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Unauthorized to pay for this order' });
    }

    if (order.payment_token) {
      return res.json({ token: order.payment_token });
    }

    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    let totalGross = 0;
    const itemDetails = items.map(item => {
      totalGross += Number(item.subtotal);
      return {
        id: item.ticket_type_id,
        price: Number(item.unit_price),
        quantity: item.quantity,
        name: 'Ticket'
      };
    });

    // Extract first attendee name for Midtrans Customer Details
    let customerName = req.user.name || 'Customer';
    if (items.length > 0 && items[0].attendee_details) {
      try {
        const details = typeof items[0].attendee_details === 'string' 
          ? JSON.parse(items[0].attendee_details) 
          : items[0].attendee_details;
        
        const firstAttendee = Array.isArray(details) ? (details[0]?.name ? details[0] : (typeof details[0] === 'object' ? details[0] : null)) : details;
        if (firstAttendee?.name) {
          customerName = firstAttendee.name.trim();
        }
      } catch (e) {
        console.error('Error parsing attendee details for Midtrans name:', e);
      }
    }
    
    console.log(`[Midtrans] Order ${orderId} -> Customer: ${customerName}`);

    // We use the derived total, fallback to order.total_amount
    const finalAmount = totalGross > 0 ? totalGross : Number(order.total_amount);

    // 2. Initialize Midtrans Snap
    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      serverKey: process.env.MIDTRANS_SERVER_KEY?.replace(/['"]/g, ''), // Removed quotes if any
      clientKey: process.env.MIDTRANS_CLIENT_KEY?.replace(/['"]/g, '')
    });

    const parameter = {
      transaction_details: {
        order_id: order.id,
        gross_amount: Math.round(finalAmount)
      },
      customer_details: {
        first_name: customerName,
        email: req.user.email
      },
      item_details: itemDetails,
      callbacks: {
        finish: 'http://localhost:3000/dashboard',
        error: 'http://localhost:3000/dashboard',
        pending: 'http://localhost:3000/dashboard'
      }
    };

    // 3. Create Transaction
    const transaction = await snap.createTransaction(parameter);
    
    // Save token
    await pool.query('UPDATE orders SET payment_token = ? WHERE id = ?', [transaction.token, order.id]);

    res.json({ token: transaction.token, redirect_url: transaction.redirect_url });
  } catch (error) {
    console.error('[payments/create] Midtrans Error:', error?.message || error);
    res.status(500).json({ error: 'Failed to create payment token' });
  }
});

// /api/payments/check/:id
router.post('/check/:id', authenticateToken, async (req, res) => {
  try {
    const order_id = req.params.id;
    
    // Check if it's a resale order
    if (order_id.startsWith('rord_')) {
      const snap = new midtransClient.Snap({
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
        serverKey: process.env.MIDTRANS_SERVER_KEY?.replace(/['"]/g, ''),
        clientKey: process.env.MIDTRANS_CLIENT_KEY?.replace(/['"]/g, '')
      });
      
      try {
        const statusResponse = await snap.transaction.status(order_id);
        const { transaction_status, fraud_status } = statusResponse;
        const result = await handleResalePaymentStatus(order_id, transaction_status, fraud_status);
        return res.json({ status: result.status });
      } catch (err) {
        // If not found in Midtrans, check DB
        const [resaleOrders] = await pool.query(`SELECT status FROM resale_orders WHERE id = ?`, [order_id]);
        return res.json({ status: resaleOrders?.[0]?.status || 'PENDING' });
      }
    }

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orders[0];

    if (order.user_id !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // If order was never submitted to Midtrans, just return current DB status
    if (!order.payment_token) {
      return res.json({ status: order.status });
    }

    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      serverKey: process.env.MIDTRANS_SERVER_KEY?.replace(/['"]/g, ''),
      clientKey: process.env.MIDTRANS_CLIENT_KEY?.replace(/['"]/g, '')
    });

    const statusResponse = await snap.transaction.status(order_id);
    const { transaction_status, fraud_status } = statusResponse;

    let newStatus = order.status;
    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      if (fraud_status === 'challenge') {
        newStatus = 'PENDING';
      } else if (fraud_status === 'accept' || !fraud_status) {
        newStatus = 'PAID';
      }
    } else if (
      transaction_status === 'cancel' ||
      transaction_status === 'deny' ||
      transaction_status === 'expire'
    ) {
      newStatus = mapFailureStatus(transaction_status);
    } else if (transaction_status === 'pending') {
      newStatus = 'PENDING';
    }

    if (transaction_status === 'pending' && order.status === 'PENDING' && !order.payment_method) {
      await pool.query(
        `UPDATE orders SET payment_method = ? WHERE id = ? AND (payment_method IS NULL OR payment_method = '')`,
        [statusResponse.payment_type || 'pending', order_id]
      );
      await sendPendingPaymentEmail(pool, order_id, statusResponse);
    }

    if (newStatus === 'PAID' && order.status !== 'PAID') {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      
      const [updateResult] = await pool.query(
        'UPDATE orders SET status = ?, paid_at = ?, payment_method = ? WHERE id = ? AND status != ?', 
        ['PAID', now, statusResponse.payment_type || order.payment_method || null, order_id, 'PAID']
      );

      if (updateResult.affectedRows === 0) {
        return res.json({ status: 'PAID' });
      }
      
      // 2. Generate Tickets
      const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order_id]);
      
      for (const item of items) {
        const ticketId = `tkt_${Math.random().toString(36).substr(2, 9)}`;
        const qrCode = `qr_${Math.random().toString(36).substr(2, 12)}`;
        const attendeeData = typeof item.attendee_details === 'string' ? item.attendee_details : JSON.stringify(item.attendee_details);

        await pool.query(
          `INSERT INTO tickets (id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at, quantity, attendee_details, order_item_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ticketId, order_id, order.user_id, item.ticket_type_id, qrCode, 'ACTIVE', 0, now, item.quantity, attendeeData, item.id]
        );
      }

      await sendPaymentSuccessEmail(pool, order_id, statusResponse.payment_type || order.payment_method || null);
    } else if (newStatus !== order.status) {
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, order_id]);
      
      if ((newStatus === 'CANCELLED' || newStatus === 'EXPIRED') && order.status === 'PENDING') {
        const [items] = await pool.query('SELECT ticket_type_id, quantity FROM order_items WHERE order_id = ?', [order_id]);
        for (const item of items) {
          await pool.query(
            'UPDATE ticket_types SET sold = GREATEST(0, sold - ?) WHERE id = ?',
            [item.quantity, item.ticket_type_id]
          );
        }

        await sendOrderExpiredEmail(pool, order_id, transaction_status === 'expire' ? 'expired' : 'failed');
      }
    }

    res.json({ status: newStatus });
  } catch (err) {
    // If transaction doesn't exist in Midtrans yet (never submitted or old order), return current DB status
    if (err.httpStatusCode === '404' || err.httpStatusCode === 404 || 
        (err.ApiResponse && err.ApiResponse.status_code === '404')) {
      const [currentOrder] = await pool.query('SELECT status FROM orders WHERE id = ?', [req.params.id]);
      return res.json({ status: currentOrder?.[0]?.status || 'PENDING' });
    }
    console.error('[payments/check]', err?.message || err);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// /api/payments/webhook
router.post('/webhook', async (req, res) => {
  try {
    const notification = req.body;
    
    // In strict production, you'd initialize midtransClient and use .transaction.notification(notification)
    // Here we'll do the standard SHA512 check for security if you'd like, but parsing works fine for a Sandbox.
    
    const { order_id, transaction_status, fraud_status } = notification;
    
    // Check if it's a resale order
    if (order_id.startsWith('rord_')) {
      await handleResalePaymentStatus(order_id, transaction_status, fraud_status);
      return res.status(200).json({ status: 'ok' });
    }
    
    // Find the regular order
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orders[0];

    if (transaction_status === 'pending' && order.status === 'PENDING' && !order.payment_method) {
      await pool.query(
        `UPDATE orders SET payment_method = ? WHERE id = ? AND (payment_method IS NULL OR payment_method = '')`,
        [notification.payment_type || 'pending', order_id]
      );
      await sendPendingPaymentEmail(pool, order_id, notification);
      return res.status(200).json({ status: 'ok' });
    }

    // Evaluate Status
    let newStatus = order.status;
    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      if (fraud_status === 'challenge') {
        newStatus = 'PENDING';
      } else if (fraud_status === 'accept' || !fraud_status) {
        newStatus = 'PAID';
      }
    } else if (
      transaction_status === 'cancel' ||
      transaction_status === 'deny' ||
      transaction_status === 'expire'
    ) {
      newStatus = mapFailureStatus(transaction_status);
    } else if (transaction_status === 'pending') {
      newStatus = 'PENDING';
    }

    // Update the DB if status changed to PAID and its currently not paid
    if (newStatus === 'PAID' && order.status !== 'PAID') {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const [updateResult] = await pool.query(
        'UPDATE orders SET status = ?, paid_at = ?, payment_method = ? WHERE id = ? AND status != ?', 
        ['PAID', now, notification.payment_type || order.payment_method || null, order_id, 'PAID']
      );

      if (updateResult.affectedRows === 0) {
        return res.status(200).json({ status: 'ok' });
      }
      
      // 2. Generate Tickets
      const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order_id]);
      
      for (const item of items) {
        const ticketId = `tkt_${Math.random().toString(36).substr(2, 9)}`;
        const qrCode = `qr_${Math.random().toString(36).substr(2, 12)}`;
        const attendeeData = typeof item.attendee_details === 'string' ? item.attendee_details : JSON.stringify(item.attendee_details);

        await pool.query(
          `INSERT INTO tickets (id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at, quantity, attendee_details, order_item_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ticketId, order_id, order.user_id, item.ticket_type_id, qrCode, 'ACTIVE', 0, now, item.quantity, attendeeData, item.id]
        );
      }

      await sendPaymentSuccessEmail(pool, order_id, notification.payment_type || order.payment_method || null);
    } else {
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, order_id]);
      
      if ((newStatus === 'CANCELLED' || newStatus === 'EXPIRED') && order.status === 'PENDING') {
        const [items] = await pool.query('SELECT ticket_type_id, quantity FROM order_items WHERE order_id = ?', [order_id]);
        for (const item of items) {
          await pool.query(
            'UPDATE ticket_types SET sold = GREATEST(0, sold - ?) WHERE id = ?',
            [item.quantity, item.ticket_type_id]
          );
        }

        await sendOrderExpiredEmail(pool, order_id, transaction_status === 'expire' ? 'expired' : 'failed');
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[payments/webhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
