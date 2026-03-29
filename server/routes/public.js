import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET /sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
  try {
    const BASE = 'https://eventra.raihanadepurnomo.dev';

    const [events] = await pool.query(`
      SELECT id, slug, updated_at
      FROM events
      WHERE status = 'PUBLISHED' AND end_date >= NOW()
    `);

    const staticUrls = [
      { loc: `${BASE}/`,        priority: '1.0', changefreq: 'weekly' },
      { loc: `${BASE}/events`,  priority: '0.9', changefreq: 'daily'  },
      { loc: `${BASE}/about`,   priority: '0.6', changefreq: 'monthly'},
      { loc: `${BASE}/privacy`, priority: '0.4', changefreq: 'monthly'},
      { loc: `${BASE}/terms`,   priority: '0.4', changefreq: 'monthly'},
    ];

    const eventUrls = events.map(e => ({
      loc: `${BASE}/events/${e.slug ?? e.id}`,
      lastmod: new Date(e.updated_at).toISOString().split('T')[0],
      priority: '0.8',
      changefreq: 'weekly',
    }));

    const allUrls = [...staticUrls, ...eventUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('[sitemap] failed:', err);
    res.status(500).send('Internal Server Error');
  }
});

// GET /api/public/stats
router.get('/public/stats', async (req, res) => {
  try {
    const [[tickets]] = await pool.query(`
      SELECT COUNT(*) as total FROM tickets
      WHERE status NOT IN ('CANCELLED', 'TRANSFERRED')
    `);

    const [[revenue]] = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM orders
      WHERE status = 'PAID'
        AND MONTH(paid_at) = MONTH(CURRENT_DATE())
        AND YEAR(paid_at)  = YEAR(CURRENT_DATE())
    `);

    const [[events]] = await pool.query(`
      SELECT COUNT(*) as total FROM events
      WHERE status = 'PUBLISHED' AND end_date >= NOW()
    `);

    res.json({
      totalTicketsSold: tickets.total,
      revenueThisMonth: revenue.total,
      activeEvents: events.total,
    });
  } catch (err) {
    console.error('[public/stats] failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
