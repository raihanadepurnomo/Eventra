import { sendEmail } from './mailer.js';

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
    `SELECT oi.*, tt.name AS ticket_name, tt.event_id, e.title AS event_title, e.start_date AS event_start_date, e.location AS event_location
     FROM order_items oi
     JOIN ticket_types tt ON oi.ticket_type_id = tt.id
     JOIN events e ON tt.event_id = e.id
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
          location: items[0].event_location,
          id: items[0].event_id,
        }
      : null,
  };
}

function buildDashboardQrImageUrl(code, size = 300) {
  const safeCode = String(code || '').trim();
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(safeCode)}`;
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
          <p>Butuh bantuan? Hubungi kami di support@eventra.com</p>
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
      `SELECT t.*, tt.name AS ticket_name
       FROM tickets t
       JOIN ticket_types tt ON t.ticket_type_id = tt.id
       WHERE t.order_id = ?
       ORDER BY t.created_at ASC`,
      [orderId]
    );

    const ticketBlocks = [];

    for (const ticket of tickets) {
      const qty = Number(ticket.quantity || 1);
      const attendees = parseJsonMaybe(ticket.attendee_details, []);
      const qrRaw = String(ticket.qr_code || ticket.id || orderId).trim();
      const qrImageUrl = buildDashboardQrImageUrl(qrRaw, 360);
      const attendeeNames = Array.isArray(attendees)
        ? attendees.map((a) => a?.name).filter(Boolean)
        : [];

      const attendeeInfoHtml = attendeeNames.length > 0
        ? `
          <div style="margin: 0 0 10px; color: #475569;">
            <p style="margin: 0 0 4px;"><strong>Peserta:</strong></p>
            <ul style="margin: 0; padding-left: 18px;">
              ${attendeeNames.map((name) => `<li style="margin: 0 0 2px;">${escapeHtml(name)}</li>`).join('')}
            </ul>
          </div>
        `
        : `<p style="margin: 0 0 10px; color: #475569;">Nama: ${escapeHtml(user.name || user.email)}</p>`;

      ticketBlocks.push(`
        <div style="border-top: 1px dashed #cbd5e1; padding-top: 14px; margin-top: 14px;">
          <p style="margin: 0 0 4px;"><strong>Tiket #${ticketBlocks.length + 1} — ${escapeHtml(ticket.ticket_name || 'Tiket')}</strong></p>
          <p style="margin: 0 0 4px; color: #475569;">Jumlah: ${escapeHtml(qty)} tiket</p>
          ${attendeeInfoHtml}
          <img src="${escapeHtml(qrImageUrl)}" alt="QR Ticket" style="width: 170px; height: 170px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;" />
          <p style="margin: 8px 0 0; font-family: monospace;">Kode: ${escapeHtml(qrRaw || '-')}</p>
        </div>
      `);
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
          <p>Lihat tiket lengkap di dashboard: <a href="${escapeHtml(`${FRONTEND_URL}/dashboard`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(`${FRONTEND_URL}/dashboard`)}</a></p>
          <p style="margin-top: 24px;">— Tim Eventra</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email/success] failed:', err);
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
