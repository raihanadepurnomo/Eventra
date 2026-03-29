import { sendEmail } from './mailer.js';
import { generateOrderTicketPdfBuffer } from './ticketPdf.js';

const FRONTEND_URL = process.env.VITE_FRONTEND_URL || 'http://localhost:3000';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatIDR(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function formatWIB(dateLike) {
  if (!dateLike) return '-';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return String(dateLike);

  const weekday = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(date);

  const rest = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(date);

  return `${weekday}, ${rest} WIB`;
}

function parseJsonMaybe(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function paymentLabel(paymentType) {
  const map = {
    bank_transfer: 'Transfer Bank (VA)',
    qris: 'QRIS',
    gopay: 'GoPay',
    shopeepay: 'ShopeePay',
    cstore: 'Convenience Store',
    echannel: 'Mandiri Bill',
    credit_card: 'Kartu Kredit',
  };
  return map[paymentType] || (paymentType ? String(paymentType).toUpperCase() : 'Belum dipilih');
}

function buildPaymentInstructionFromMidtrans(midtransData = {}) {
  const paymentType = midtransData.payment_type || midtransData.paymentType || null;

  if (!paymentType) {
    return {
      paymentMethod: 'Belum dipilih',
      instructionHtml: 'Silakan pilih metode pembayaran pada halaman Midtrans yang terbuka setelah checkout.',
    };
  }

  if (paymentType === 'bank_transfer') {
    const vaNumbers = Array.isArray(midtransData.va_numbers) ? midtransData.va_numbers : [];
    const permataVA = midtransData.permata_va_number;

    if (vaNumbers.length > 0) {
      const vaLines = vaNumbers
        .map((v) => `${escapeHtml(v.bank || 'Bank').toUpperCase()}: <strong>${escapeHtml(v.va_number)}</strong>`)
        .join('<br/>');

      return {
        paymentMethod: 'Transfer Bank (VA)',
        instructionHtml: `Gunakan nomor Virtual Account berikut:<br/>${vaLines}`,
      };
    }

    if (permataVA) {
      return {
        paymentMethod: 'Transfer Bank (Permata VA)',
        instructionHtml: `Nomor VA Permata: <strong>${escapeHtml(permataVA)}</strong>`,
      };
    }

    return {
      paymentMethod: 'Transfer Bank (VA)',
      instructionHtml: 'Silakan cek aplikasi atau internet banking Anda untuk detail Virtual Account.',
    };
  }

  if (paymentType === 'qris') {
    const actions = Array.isArray(midtransData.actions) ? midtransData.actions : [];
    const qrAction = actions.find((a) => a && (a.name === 'generate-qr-code' || a.name === 'deeplink-redirect'));

    if (qrAction?.url) {
      return {
        paymentMethod: 'QRIS',
        instructionHtml: `Scan QR untuk bayar: <a href="${escapeHtml(qrAction.url)}" target="_blank" rel="noopener noreferrer">Buka QRIS</a>`,
      };
    }

    return {
      paymentMethod: 'QRIS',
      instructionHtml: 'Silakan buka halaman pembayaran untuk menampilkan QRIS.',
    };
  }

  if (paymentType === 'cstore') {
    const store = midtransData.store || 'Convenience Store';
    const code = midtransData.payment_code;
    return {
      paymentMethod: `${store} Payment`,
      instructionHtml: code
        ? `Gunakan kode pembayaran: <strong>${escapeHtml(code)}</strong>`
        : 'Silakan cek kode pembayaran pada halaman transaksi Anda.',
    };
  }

  if (paymentType === 'echannel') {
    const billKey = midtransData.bill_key;
    const billerCode = midtransData.biller_code;
    return {
      paymentMethod: 'Mandiri Bill',
      instructionHtml: `Biller Code: <strong>${escapeHtml(billerCode || '-')}</strong><br/>Bill Key: <strong>${escapeHtml(billKey || '-')}</strong>`,
    };
  }

  return {
    paymentMethod: paymentLabel(paymentType),
    instructionHtml: `Selesaikan pembayaran menggunakan metode ${escapeHtml(paymentLabel(paymentType))} sebelum batas waktu berakhir.`,
  };
}

async function getOrderEmailContext(pool, orderId) {
  const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) return null;
  const order = orders[0];

  const [users] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [order.user_id]);
  const user = users[0] || null;

  const [items] = await pool.query(
    `SELECT oi.*, tt.name AS ticket_name, tt.event_id,
            e.title AS event_title, e.start_date AS event_start_date, e.end_date AS event_end_date,
            e.location AS event_location, e.eo_profile_id, ep.org_name AS eo_name
     FROM order_items oi
     JOIN ticket_types tt ON oi.ticket_type_id = tt.id
     JOIN events e ON tt.event_id = e.id
     LEFT JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  return {
    order,
    user,
    items,
    event: items[0]
      ? {
          title: items[0].event_title,
          startDate: items[0].event_start_date,
          endDate: items[0].event_end_date,
          location: items[0].event_location,
          id: items[0].event_id,
          eoProfileId: items[0].eo_profile_id,
          eoName: items[0].eo_name,
        }
      : null,
  };
}

async function getResaleOrderEmailContext(pool, resaleOrderId) {
  const [rows] = await pool.query(
    `SELECT
       ro.*,
       rl.ticket_id,
       rl.id AS resale_listing_id,
       rl.seller_id,
       rl.asking_price,
       rl.platform_fee,
       rl.seller_receives,
       tt.id AS ticket_type_id,
       tt.name AS ticket_type_name,
       e.id AS event_id,
       e.title AS event_title,
       e.start_date AS event_start_date,
       e.end_date AS event_end_date,
       e.location AS event_location,
       e.eo_profile_id,
       ep.org_name AS eo_name,
       u.id AS user_id,
       u.name AS user_name,
       u.email AS user_email,
       su.name AS seller_name,
       su.email AS seller_email
     FROM resale_orders ro
     JOIN resale_listings rl ON rl.id = ro.resale_listing_id
     JOIN tickets old_t ON old_t.id = rl.ticket_id
     JOIN ticket_types tt ON tt.id = old_t.ticket_type_id
     JOIN events e ON e.id = tt.event_id
     LEFT JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     JOIN users u ON u.id = ro.buyer_id
     LEFT JOIN users su ON su.id = rl.seller_id
     WHERE ro.id = ?
     LIMIT 1`,
    [resaleOrderId]
  );

  if (!rows.length) return null;
  const row = rows[0];

  const [tickets] = await pool.query(
    `SELECT t.*, tt.name AS ticket_name, tt.is_bundle, tt.bundle_qty
     FROM tickets t
     JOIN ticket_types tt ON tt.id = t.ticket_type_id
     WHERE t.order_id = ?
     ORDER BY t.created_at ASC`,
    [resaleOrderId]
  );

  return {
    order: row,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
    },
    seller: {
      id: row.seller_id,
      name: row.seller_name,
      email: row.seller_email,
    },
    tickets,
    event: {
      id: row.event_id,
      title: row.event_title,
      startDate: row.event_start_date,
      endDate: row.event_end_date,
      location: row.event_location,
      eoProfileId: row.eo_profile_id,
      eoName: row.eo_name,
    },
    ticketTypeName: row.ticket_type_name,
  };
}

async function getResaleListingEmailContext(pool, resaleListingId) {
  const [rows] = await pool.query(
    `SELECT
       rl.*,
       t.id AS ticket_id,
       tt.id AS ticket_type_id,
       tt.name AS ticket_type_name,
       e.id AS event_id,
       e.title AS event_title,
       e.start_date AS event_start_date,
       e.end_date AS event_end_date,
       e.location AS event_location,
       e.eo_profile_id,
       ep.org_name AS eo_name,
       seller.id AS seller_user_id,
       seller.name AS seller_name,
       seller.email AS seller_email
     FROM resale_listings rl
     JOIN tickets t ON t.id = rl.ticket_id
     JOIN ticket_types tt ON tt.id = t.ticket_type_id
     JOIN events e ON e.id = tt.event_id
     LEFT JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     JOIN users seller ON seller.id = rl.seller_id
     WHERE rl.id = ?
     LIMIT 1`,
    [resaleListingId]
  );

  if (!rows.length) return null;
  const row = rows[0];

  return {
    listing: row,
    seller: {
      id: row.seller_user_id,
      name: row.seller_name,
      email: row.seller_email,
    },
    event: {
      id: row.event_id,
      title: row.event_title,
      startDate: row.event_start_date,
      endDate: row.event_end_date,
      location: row.event_location,
      eoProfileId: row.eo_profile_id,
      eoName: row.eo_name,
    },
    ticketTypeName: row.ticket_type_name,
  };
}

function buildDashboardQrImageUrl(code, size = 300) {
  const safeCode = String(code || '').trim();
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(safeCode)}`;
}

function sanitizeFilename(name) {
  return String(name || 'ticket')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'ticket';
}

async function getTicketCheckInEmailContext(pool, ticketId) {
  const [rows] = await pool.query(
    `SELECT
       t.id,
       t.order_id,
       t.user_id,
       t.qr_code,
       t.status,
       t.used_at,
       t.quantity,
       t.attendee_details,
       tt.name AS ticket_type_name,
       tt.is_bundle,
       tt.bundle_qty,
       e.id AS event_id,
       e.title AS event_title,
       e.start_date AS event_start_date,
       e.end_date AS event_end_date,
       e.location AS event_location,
       e.eo_profile_id,
       ep.org_name AS eo_name,
       u.name AS user_name,
       u.email AS user_email
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     JOIN ticket_types tt ON tt.id = t.ticket_type_id
     JOIN events e ON e.id = tt.event_id
     LEFT JOIN eo_profiles ep ON ep.id = e.eo_profile_id
     WHERE t.id = ?
     LIMIT 1`,
    [ticketId]
  );

  if (!rows.length) return null;
  const row = rows[0];

  const attendees = parseJsonMaybe(row.attendee_details, []);
  const attendeeNames = Array.isArray(attendees)
    ? attendees.map((a) => a?.name).filter(Boolean)
    : [];

  return {
    ticket: row,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
    },
    event: {
      id: row.event_id,
      title: row.event_title,
      startDate: row.event_start_date,
      endDate: row.event_end_date,
      location: row.event_location,
      eoProfileId: row.eo_profile_id,
      eoName: row.eo_name,
    },
    ticketTypeName: row.ticket_type_name,
    attendeeNames,
  };
}

export async function sendPendingPaymentEmail(pool, orderId, midtransData = {}) {
  try {
    const ctx = await getOrderEmailContext(pool, orderId);
    if (!ctx || !ctx.user?.email) return;

    const { order, user, items, event } = ctx;
    const firstItem = items[0] || null;
    const paymentInfo = buildPaymentInstructionFromMidtrans(midtransData);

    await sendEmail({
      to: user.email,
      subject: `Selesaikan Pembayaran Tiket ${event?.title || 'Eventra'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(user.name || user.email)},</p>
          <p>Pesanan tiket kamu sedang menunggu pembayaran. Segera selesaikan sebelum kedaluwarsa ya.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))} · ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0; color: #475569;">${escapeHtml(firstItem?.ticket_name || 'Tiket')} × ${escapeHtml(firstItem?.quantity || 1)}</p>
          </div>

          <p style="margin: 6px 0;">Total Pembayaran: <strong>${escapeHtml(formatIDR(order.total_amount))}</strong></p>
          <p style="margin: 6px 0;">Metode Pembayaran: <strong>${escapeHtml(paymentInfo.paymentMethod)}</strong></p>
          <p style="margin: 6px 0;">Batas Pembayaran: <strong>${escapeHtml(formatWIB(order.expired_at))}</strong></p>
          <p style="margin: 12px 0 0;">Cara bayar via ${escapeHtml(paymentInfo.paymentMethod)}:<br/>${paymentInfo.instructionHtml}</p>

          <p style="margin-top: 16px;">Setelah pembayaran berhasil, tiket akan langsung muncul di dashboard kamu.</p>
          <p>Butuh bantuan? Hubungi kami di support@eventra.raihanadepurnomo.dev</p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/pending] failed:', err);
  }
}

export async function sendOrderExpiredEmail(pool, orderId, reason = 'expired') {
  try {
    const ctx = await getOrderEmailContext(pool, orderId);
    if (!ctx || !ctx.user?.email) return;

    const { order, user, items, event } = ctx;
    const firstItem = items[0] || null;
    const statusText = reason === 'failed' ? 'Pembayaran Gagal' : 'Kedaluwarsa';

    const eventLink = event?.id ? `${FRONTEND_URL}/events/${event.id}` : `${FRONTEND_URL}/events`;

    await sendEmail({
      to: user.email,
      subject: `Pesanan Tiket ${event?.title || 'Event'} Kedaluwarsa`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(user.name || user.email)},</p>
          <p>Pesanan tiketmu untuk <strong>${escapeHtml(event?.title || 'event ini')}</strong> tidak dapat diproses karena melewati batas waktu atau pembayaran gagal.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))} · ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(firstItem?.ticket_name || 'Tiket')} × ${escapeHtml(firstItem?.quantity || 1)}</p>
            <p style="margin: 0;">Total: <strong>${escapeHtml(formatIDR(order.total_amount))}</strong></p>
            <p style="margin: 6px 0 0;">Status: <strong>${escapeHtml(statusText)}</strong></p>
          </div>

          <p>Kuota tiket telah dikembalikan. Kamu masih bisa memesan ulang selama tiket tersedia.</p>
          <p><a href="${escapeHtml(eventLink)}" target="_blank" rel="noopener noreferrer">Pesan tiket lagi</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/expired] failed:', err);
  }
}

export async function sendPaymentSuccessEmail(pool, orderId, paymentMethod = null) {
  try {
    const ctx = await getOrderEmailContext(pool, orderId);
    if (!ctx || !ctx.user?.email) return;

    const { order, user, event } = ctx;
    const [tickets] = await pool.query(
      `SELECT t.*, tt.name AS ticket_name, tt.is_bundle, tt.bundle_qty
       FROM tickets t
       JOIN ticket_types tt ON t.ticket_type_id = tt.id
       WHERE t.order_id = ?
       ORDER BY t.created_at ASC`,
      [orderId]
    );

    const ticketBlocks = [];

    for (const ticket of tickets) {
      const qty = Number(ticket.quantity || 1);
      const bundleIndex = Number(ticket.bundle_index || 1);
      const bundleTotal = Number(ticket.bundle_total || 1);
      const isBundleType = Number(ticket.is_bundle || 0) === 1;
      const bundleQty = Math.max(2, Number(ticket.bundle_qty || qty || 2));
      const attendees = parseJsonMaybe(ticket.attendee_details, []);
      const qrRaw = String(ticket.qr_code || ticket.id || orderId).trim();
      const qrImageUrl = buildDashboardQrImageUrl(qrRaw, 360);
      const attendeeNames = Array.isArray(attendees)
        ? attendees.map((a) => a?.name).filter(Boolean)
        : [];
      const ticketLabel = isBundleType
        ? (bundleTotal > 1
          ? `${ticket.ticket_name || 'Tiket'} - Paket ${bundleIndex} dari ${bundleTotal}`
          : `${ticket.ticket_name || 'Tiket'} - Paket Bundling (${bundleQty} orang)`)
        : (ticket.ticket_name || 'Tiket');
      const qtyLabel = isBundleType ? `${qty} orang` : `${qty} tiket`;
      const attendeeTitle = String(ticket.status || '').toUpperCase() === 'USED'
        ? 'Peserta Check-in'
        : 'Peserta Terdaftar';

      const attendeeInfoHtml = attendeeNames.length > 0
        ? `
          <div style="margin: 0 0 10px; color: #475569;">
            <p style="margin: 0 0 4px;"><strong>${escapeHtml(attendeeTitle)}:</strong></p>
            <ul style="margin: 0; padding-left: 18px;">
              ${attendeeNames.map((name) => `<li style="margin: 0 0 2px;">${escapeHtml(name)}</li>`).join('')}
            </ul>
          </div>
        `
        : `<p style="margin: 0 0 10px; color: #475569;">Nama: ${escapeHtml(user.name || user.email)}</p>`;

      ticketBlocks.push(`
        <div style="border-top: 1px dashed #cbd5e1; padding-top: 14px; margin-top: 14px;">
          <p style="margin: 0 0 4px;"><strong>Tiket #${ticketBlocks.length + 1} — ${escapeHtml(ticketLabel)}</strong></p>
          <p style="margin: 0 0 4px; color: #475569;">Jumlah: ${escapeHtml(qtyLabel)}</p>
          ${attendeeInfoHtml}
          <img src="${escapeHtml(qrImageUrl)}" alt="QR Ticket" style="width: 170px; height: 170px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;" />
          <p style="margin: 8px 0 0; font-family: monospace;">Kode: ${escapeHtml(qrRaw || '-')}</p>
        </div>
      `);
    }

    let attachments = [];
    if (tickets.length > 0) {
      try {
        const pdfBuffer = await generateOrderTicketPdfBuffer({
          platformName: 'Eventra',
          tickets,
          event,
          eoName: event?.eoName || '-',
        });

        if (pdfBuffer) {
          const eventPart = sanitizeFilename(event?.title || 'event');
          const orderPart = sanitizeFilename(String(orderId).slice(0, 16));
          attachments = [{
            filename: `tickets-${eventPart}-${orderPart}.pdf`,
            content: pdfBuffer,
          }];
        }
      } catch (pdfErr) {
        console.error('[email/success][pdf-attachment-merged] failed:', pdfErr);
      }
    }

    await sendEmail({
      to: user.email,
      subject: `Tiket Kamu Sudah Siap — ${event?.title || 'Eventra'} 🎉`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(user.name || user.email)},</p>
          <p>Pembayaranmu berhasil! Tiket kamu sudah siap.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))}</p>
            <p style="margin: 0 0 10px; color: #475569;">📍 ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0;">No. Pesanan: <strong>${escapeHtml(orderId)}</strong></p>
            <p style="margin: 6px 0 0;">Total Dibayar: <strong>${escapeHtml(formatIDR(order.total_amount))}</strong></p>
            <p style="margin: 6px 0 0;">Metode: <strong>${escapeHtml(paymentLabel(paymentMethod || order.payment_method))}</strong></p>
          </div>

          <h3 style="margin: 0 0 8px;">Tiket Kamu</h3>
          ${ticketBlocks.join('') || '<p>Tiket sedang diproses.</p>'}

          <p style="margin-top: 16px; color: #334155;">Tunjukkan QR Code ini ke petugas saat memasuki venue. Satu QR Code hanya berlaku untuk satu kali masuk.</p>
          <p style="margin-top: 8px; color: #334155;">File PDF tiket juga terlampir di email ini.</p>
          <p>Lihat tiket lengkap di dashboard: <a href="${escapeHtml(`${FRONTEND_URL}/dashboard`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(`${FRONTEND_URL}/dashboard`)}</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
      attachments,
    });
  } catch (err) {
    console.error('[email/success] failed:', err);
  }
}

export async function sendResalePaymentSuccessEmail(pool, resaleOrderId, paymentMethod = null) {
  try {
    const ctx = await getResaleOrderEmailContext(pool, resaleOrderId);
    if (!ctx || !ctx.user?.email) return;

    const { order, user, event, tickets, ticketTypeName } = ctx;

    const ticketBlocks = [];
    for (const ticket of tickets) {
      const qty = Number(ticket.quantity || 1);
      const attendees = parseJsonMaybe(ticket.attendee_details, []);
      const attendeeNames = Array.isArray(attendees)
        ? attendees.map((a) => a?.name).filter(Boolean)
        : [];
      const qrRaw = String(ticket.qr_code || ticket.id || resaleOrderId).trim();
      const qrImageUrl = buildDashboardQrImageUrl(qrRaw, 360);
      const label = ticket.ticket_name || ticketTypeName || 'Tiket Resale';

      ticketBlocks.push(`
        <div style="border-top: 1px dashed #cbd5e1; padding-top: 14px; margin-top: 14px;">
          <p style="margin: 0 0 4px;"><strong>${escapeHtml(label)}</strong></p>
          <p style="margin: 0 0 4px; color: #475569;">Jumlah: ${escapeHtml(`${qty} tiket`)}</p>
          ${attendeeNames.length > 0
            ? `<p style="margin: 0 0 10px; color: #475569;">Peserta: ${escapeHtml(attendeeNames.join(', '))}</p>`
            : `<p style="margin: 0 0 10px; color: #475569;">Peserta: ${escapeHtml(user.name || user.email)}</p>`}
          <img src="${escapeHtml(qrImageUrl)}" alt="QR Ticket" style="width: 170px; height: 170px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;" />
          <p style="margin: 8px 0 0; font-family: monospace;">Kode: ${escapeHtml(qrRaw || '-')}</p>
        </div>
      `);
    }

    let attachments = [];
    if (tickets.length > 0) {
      try {
        const pdfBuffer = await generateOrderTicketPdfBuffer({
          platformName: 'Eventra',
          tickets,
          event,
          eoName: event?.eoName || '-',
        });

        if (pdfBuffer) {
          const eventPart = sanitizeFilename(event?.title || 'event');
          const orderPart = sanitizeFilename(String(resaleOrderId).slice(0, 16));
          attachments = [{
            filename: `tickets-resale-${eventPart}-${orderPart}.pdf`,
            content: pdfBuffer,
          }];
        }
      } catch (pdfErr) {
        console.error('[email/resale-success][pdf-attachment] failed:', pdfErr);
      }
    }

    await sendEmail({
      to: user.email,
      subject: `Tiket Resale Kamu Sudah Siap — ${event?.title || 'Eventra'} 🎉`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(user.name || user.email)},</p>
          <p>Pembayaran resale berhasil. Tiket dengan QR baru sudah aktif dan siap digunakan.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))}</p>
            <p style="margin: 0 0 10px; color: #475569;">📍 ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0;">No. Pesanan Resale: <strong>${escapeHtml(resaleOrderId)}</strong></p>
            <p style="margin: 6px 0 0;">Total Dibayar: <strong>${escapeHtml(formatIDR(order.total_paid || order.total_amount || order.asking_price || 0))}</strong></p>
            <p style="margin: 6px 0 0;">Metode: <strong>${escapeHtml(paymentLabel(paymentMethod || order.payment_method))}</strong></p>
          </div>

          <h3 style="margin: 0 0 8px;">Tiket Kamu</h3>
          ${ticketBlocks.join('') || '<p>Tiket sedang diproses.</p>'}

          <p style="margin-top: 16px; color: #334155;">QR lama milik penjual sudah tidak berlaku. Gunakan QR baru pada tiket ini untuk masuk venue.</p>
          <p style="margin-top: 8px; color: #334155;">File PDF tiket juga terlampir di email ini.</p>
          <p>Lihat tiket lengkap di dashboard: <a href="${escapeHtml(`${FRONTEND_URL}/dashboard`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(`${FRONTEND_URL}/dashboard`)}</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
      attachments,
    });
  } catch (err) {
    console.error('[email/resale-success] failed:', err);
  }
}

export async function sendResalePendingPaymentEmail(pool, resaleOrderId, midtransData = {}) {
  try {
    const ctx = await getResaleOrderEmailContext(pool, resaleOrderId);
    if (!ctx || !ctx.user?.email) return;

    const { order, user, event, ticketTypeName } = ctx;
    const paymentInfo = buildPaymentInstructionFromMidtrans(midtransData);

    await sendEmail({
      to: user.email,
      subject: `Selesaikan Pembayaran Resale — ${event?.title || 'Eventra'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(user.name || user.email)},</p>
          <p>Pesanan resale kamu sedang menunggu pembayaran. Segera selesaikan sebelum kedaluwarsa.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))} · ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0; color: #475569;">${escapeHtml(ticketTypeName || 'Tiket Resale')} × 1</p>
          </div>

          <p style="margin: 6px 0;">No. Pesanan Resale: <strong>${escapeHtml(resaleOrderId)}</strong></p>
          <p style="margin: 6px 0;">Total Pembayaran: <strong>${escapeHtml(formatIDR(order.total_paid || order.asking_price || 0))}</strong></p>
          <p style="margin: 6px 0;">Metode Pembayaran: <strong>${escapeHtml(paymentInfo.paymentMethod)}</strong></p>
          <p style="margin: 6px 0;">Batas Pembayaran: <strong>${escapeHtml(formatWIB(order.expired_at))}</strong></p>
          <p style="margin: 12px 0 0;">Cara bayar via ${escapeHtml(paymentInfo.paymentMethod)}:<br/>${paymentInfo.instructionHtml}</p>

          <p style="margin-top: 16px;">Setelah pembayaran berhasil, QR baru otomatis aktif di dashboard kamu.</p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/resale-pending] failed:', err);
  }
}

export async function sendResaleOrderExpiredEmail(pool, resaleOrderId, reason = 'expired') {
  try {
    const ctx = await getResaleOrderEmailContext(pool, resaleOrderId);
    if (!ctx || !ctx.user?.email) return;

    const { order, user, event, ticketTypeName } = ctx;
    const statusText = reason === 'failed' ? 'Pembayaran Gagal' : 'Kedaluwarsa';
    const eventLink = event?.id ? `${FRONTEND_URL}/events/${event.id}` : `${FRONTEND_URL}/events`;

    await sendEmail({
      to: user.email,
      subject: `Pesanan Resale ${event?.title || 'Event'} ${statusText}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(user.name || user.email)},</p>
          <p>Pesanan resale tiket untuk <strong>${escapeHtml(event?.title || 'event ini')}</strong> tidak dapat diproses karena pembayaran ${reason === 'failed' ? 'gagal' : 'melewati batas waktu'}.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))} · ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(ticketTypeName || 'Tiket Resale')} × 1</p>
            <p style="margin: 0;">Total: <strong>${escapeHtml(formatIDR(order.total_paid || order.asking_price || 0))}</strong></p>
            <p style="margin: 6px 0 0;">Status: <strong>${escapeHtml(statusText)}</strong></p>
          </div>

          <p>Kamu tetap bisa mencoba membeli listing lain selama tiket masih tersedia.</p>
          <p><a href="${escapeHtml(eventLink)}" target="_blank" rel="noopener noreferrer">Lihat event</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/resale-expired] failed:', err);
  }
}

export async function sendResaleListingPublishedEmail(pool, resaleListingId) {
  try {
    const ctx = await getResaleListingEmailContext(pool, resaleListingId);
    if (!ctx || !ctx.seller?.email) return;

    const { listing, seller, event, ticketTypeName } = ctx;
    const dashboardUrl = `${FRONTEND_URL}/dashboard`;

    await sendEmail({
      to: seller.email,
      subject: `Listing Resale Aktif — ${event?.title || 'Eventra'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(seller.name || seller.email)},</p>
          <p>Tiket kamu berhasil masuk marketplace resale dan sekarang bisa dibeli pengguna lain.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))} · ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(ticketTypeName || 'Tiket Resale')}</p>
            <p style="margin: 0 0 6px;">Harga Listing: <strong>${escapeHtml(formatIDR(listing.asking_price || 0))}</strong></p>
            <p style="margin: 0 0 6px;">Estimasi Diterima: <strong>${escapeHtml(formatIDR(listing.seller_receives || 0))}</strong></p>
            <p style="margin: 0;">Batas Listing: <strong>${escapeHtml(formatWIB(listing.expired_at))}</strong></p>
          </div>

          <p>Tiket dalam status listing dan tidak dapat digunakan untuk check-in selama belum terjual atau belum berakhir.</p>
          <p>Lihat status listing: <a href="${escapeHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(dashboardUrl)}</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/resale-listing-published] failed:', err);
  }
}

export async function sendResaleListingSoldEmail(pool, resaleOrderId) {
  try {
    const ctx = await getResaleOrderEmailContext(pool, resaleOrderId);
    if (!ctx || !ctx.seller?.email) return;

    const { order, seller, event, ticketTypeName } = ctx;
    const dashboardUrl = `${FRONTEND_URL}/dashboard`;

    await sendEmail({
      to: seller.email,
      subject: `Tiket Resale Berhasil Terjual — ${event?.title || 'Eventra'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(seller.name || seller.email)},</p>
          <p>Selamat, tiket resale kamu sudah berhasil terjual.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(ticketTypeName || 'Tiket Resale')}</p>
            <p style="margin: 0 0 6px;">Harga Jual: <strong>${escapeHtml(formatIDR(order.asking_price || 0))}</strong></p>
            <p style="margin: 0 0 6px;">Biaya Platform: <strong>${escapeHtml(formatIDR(order.platform_fee || 0))}</strong></p>
            <p style="margin: 0;">Saldo Masuk: <strong>${escapeHtml(formatIDR(order.seller_receives || 0))}</strong></p>
          </div>

          <p>Dana sudah ditambahkan ke saldo kamu dan bisa diajukan pencairan dari dashboard.</p>
          <p>Lihat saldo: <a href="${escapeHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(dashboardUrl)}</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/resale-listing-sold] failed:', err);
  }
}

export async function sendResaleListingExpiredEmail(pool, resaleListingId, reason = 'expired') {
  try {
    const ctx = await getResaleListingEmailContext(pool, resaleListingId);
    if (!ctx || !ctx.seller?.email) return;

    const { listing, seller, event, ticketTypeName } = ctx;
    const statusLabel = reason === 'failed' ? 'Gagal' : 'Kedaluwarsa';
    const dashboardUrl = `${FRONTEND_URL}/dashboard`;
    const compensation = Number(listing.original_price || 0);

    await sendEmail({
      to: seller.email,
      subject: `Listing Resale ${statusLabel} — ${event?.title || 'Eventra'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(seller.name || seller.email)},</p>
          <p>Listing resale kamu untuk event <strong>${escapeHtml(event?.title || 'ini')}</strong> telah ${escapeHtml(statusLabel.toLowerCase())} dan tiket tidak terjual.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(ticketTypeName || 'Tiket Resale')}</p>
            <p style="margin: 0 0 6px;">Status Listing: <strong>${escapeHtml(statusLabel)}</strong></p>
            <p style="margin: 0 0 6px;">Harga Listing: <strong>${escapeHtml(formatIDR(listing.asking_price || 0))}</strong></p>
            <p style="margin: 0;">Saldo Ditambahkan: <strong>${escapeHtml(formatIDR(compensation))}</strong></p>
          </div>

          <p>Tiket untuk listing ini sudah dinonaktifkan dan tidak dapat digunakan untuk check-in.</p>
          <p>Lihat riwayat saldo: <a href="${escapeHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(dashboardUrl)}</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/resale-listing-expired] failed:', err);
  }
}

export async function sendTicketCheckInSuccessEmail(pool, ticketId, options = {}) {
  try {
    const ctx = await getTicketCheckInEmailContext(pool, ticketId);
    if (!ctx || !ctx.user?.email) return;

    const { ticket, user, event, ticketTypeName, attendeeNames } = ctx;
    const checkedInAt = options?.checkedInAt || ticket.used_at || new Date().toISOString();
    const qty = Math.max(1, Number(ticket.quantity || 1));
    const isBundle = Number(ticket.is_bundle || 0) === 1;
    const qtyLabel = isBundle ? `${qty} orang` : `${qty} tiket`;
    const attendeeLine = attendeeNames.length > 0
      ? attendeeNames.join(', ')
      : (user.name || user.email || '-');

    await sendEmail({
      to: user.email,
      subject: `Check-in Berhasil — ${event?.title || 'Eventra'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(user.name || user.email)},</p>
          <p>Tiket kamu berhasil di-check-in oleh petugas di venue.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>${escapeHtml(event?.title || 'Event')}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event?.startDate))}</p>
            <p style="margin: 0 0 6px; color: #475569;">📍 ${escapeHtml(event?.location || '-')}</p>
            <p style="margin: 0 0 6px;">Jenis Tiket: <strong>${escapeHtml(ticketTypeName || 'Tiket')}</strong></p>
            <p style="margin: 0 0 6px;">Jumlah: <strong>${escapeHtml(qtyLabel)}</strong></p>
            <p style="margin: 0 0 6px;">Peserta: <strong>${escapeHtml(attendeeLine)}</strong></p>
            <p style="margin: 0 0 6px;">Waktu Check-in: <strong>${escapeHtml(formatWIB(checkedInAt))}</strong></p>
            <p style="margin: 0; font-family: monospace;">Kode QR: ${escapeHtml(ticket.qr_code || '-')}</p>
          </div>

          <p>Status tiket di dashboard sudah diperbarui menjadi <strong>Digunakan</strong>.</p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/checkin-success] failed:', err);
  }
}

export async function sendEOVerificationPendingEmail({ to, recipientName, orgName }) {
  try {
    if (!to) return;

    await sendEmail({
      to,
      subject: 'Pengajuan EO Kamu Sedang Ditinjau',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(recipientName || orgName || to)},</p>
          <p>Pengajuan Event Organizer untuk <strong>${escapeHtml(orgName || 'organisasi kamu')}</strong> sudah kami terima.</p>
          <p>Status saat ini: <strong>Menunggu Verifikasi Super Admin</strong>.</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; margin: 16px 0;">
            <p style="margin: 0 0 6px;"><strong>Apa selanjutnya?</strong></p>
            <p style="margin: 0; color: #475569;">Tim kami akan melakukan peninjauan data EO kamu. Kami akan kirim email lagi saat status verifikasi berubah.</p>
          </div>

          <p>Kamu tetap bisa melengkapi profil di dashboard sambil menunggu proses verifikasi.</p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/eo-pending] failed:', err);
  }
}

export async function sendEOVerificationApprovedEmail({ to, recipientName, orgName }) {
  try {
    if (!to) return;
    const dashboardUrl = `${FRONTEND_URL}/eo/dashboard`;

    await sendEmail({
      to,
      subject: 'Selamat! Verifikasi EO Kamu Disetujui',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(recipientName || orgName || to)},</p>
          <p>Selamat, pengajuan Event Organizer untuk <strong>${escapeHtml(orgName || 'organisasi kamu')}</strong> telah <strong>disetujui</strong> oleh Super Admin.</p>

          <div style="border: 1px solid #dcfce7; border-radius: 10px; padding: 16px; background: #f0fdf4; margin: 16px 0;">
            <p style="margin: 0; color: #166534;">Akun EO kamu sekarang aktif dan siap digunakan untuk membuat event dan menjual tiket.</p>
          </div>

          <p><a href="${escapeHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer">Buka Dashboard EO</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/eo-approved] failed:', err);
  }
}

export async function sendEOVerificationRejectedEmail({
  to,
  recipientName,
  orgName,
  reasonTitle,
  reasonDescription,
}) {
  try {
    if (!to) return;
    const setupUrl = `${FRONTEND_URL}/eo/setup`;

    await sendEmail({
      to,
      subject: 'Update Verifikasi EO Kamu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(recipientName || orgName || to)},</p>
          <p>Pengajuan Event Organizer untuk <strong>${escapeHtml(orgName || 'organisasi kamu')}</strong> saat ini <strong>belum dapat disetujui</strong> oleh Super Admin.</p>

          <div style="border: 1px solid #fee2e2; border-radius: 10px; padding: 16px; background: #fef2f2; margin: 16px 0;">
            <p style="margin: 0 0 8px; color: #991b1b;"><strong>Alasan:</strong> ${escapeHtml(reasonTitle || 'Data EO belum memenuhi persyaratan')}</p>
            <p style="margin: 0; color: #991b1b;">${escapeHtml(reasonDescription || 'Silakan periksa kembali data EO kamu, lalu lakukan pembaruan jika diperlukan.')}</p>
          </div>

          <p><a href="${escapeHtml(setupUrl)}" target="_blank" rel="noopener noreferrer">Perbarui Data EO</a></p>
          <p>Jika butuh bantuan, hubungi tim support Eventra.</p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/eo-rejected] failed:', err);
  }
}

export async function sendEventReminderEmail({
  to,
  recipientName,
  event
}) {
  try {
    if (!to || !event) return;
    const dashboardUrl = `${FRONTEND_URL}/dashboard`;

    await sendEmail({
      to,
      subject: `Besok! Bersiap untuk Event ${event.title || 'Eventra'} ⏱️`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
          <p>Halo ${escapeHtml(recipientName || to)},</p>
          <p>Tidak terasa, event yang kamu tunggu-tunggu akan dimulai <strong>besok</strong>!</p>

          <div style="border: 1px solid #e0e7ff; border-radius: 10px; padding: 16px; background: #eef2ff; margin: 16px 0;">
            <p style="margin: 0 0 6px; color: #4338ca;"><strong>${escapeHtml(event.title)}</strong></p>
            <p style="margin: 0 0 6px; color: #475569;">${escapeHtml(formatWIB(event.startDate))}</p>
            <p style="margin: 0; color: #475569;">📍 ${escapeHtml(event.location || '-')}</p>
          </div>

          <p>Tolong pastikan kamu sudah menyiapkan tiket QR Code di handphone kamu sebelum tiba di venue untuk mempercepat proses check-in!</p>
          <p>Lihat tiket kamu sekarang di dashboard Eventra:</p>
          <p><a href="${escapeHtml(dashboardUrl)}" style="background: #4f46e5; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">Buka Dashboard Tiket</a></p>
          
          <p style="margin-top: 24px;">Sampai jumpa besok di venue!</p>
          <p style="margin-top: 4px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/reminder-h1] failed:', err);
  }
}
