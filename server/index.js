import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import eventRoutes from './routes/events.js';
import ticketTypeRoutes from './routes/ticketTypes.js';
import eoProfileRoutes from './routes/eoProfiles.js';
import orderRoutes from './routes/orders.js';
import ticketRoutes from './routes/tickets.js';
import orderItemRoutes from './routes/orderItems.js';
import paymentRoutes from './routes/payments.js';
import socialRoutes from './routes/social.js';
import resaleRoutes from './routes/resale.js';
import eoFinanceRoutes from './routes/eoFinance.js';
import pool from './db.js';

const app = express();
const PORT = process.env.SERVER_PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Serve static directories from public folder
app.use('/banner-image', express.static(path.join(process.cwd(), '..', 'public', 'banner-image')));
app.use('/user-photo', express.static(path.join(process.cwd(), '..', 'public', 'user-photo')));
app.use('/receipts', express.static(path.join(process.cwd(), '..', 'public', 'receipts')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/ticket-types', ticketTypeRoutes);
app.use('/api/eo-profiles', eoProfileRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/order-items', orderItemRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/resale', resaleRoutes);
app.use('/api/eo', eoFinanceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File terlalu besar. Maksimum 5MB.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Test DB connection
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected to database:', process.env.DB_NAME || 'eventra');
    conn.release();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
