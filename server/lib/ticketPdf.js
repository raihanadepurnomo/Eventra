import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

const FONT_DIR = path.join(process.cwd(), '..', 'public', 'fonts');
const MONTSERRAT_REGULAR_PATH = path.join(FONT_DIR, 'Montserrat-Regular.ttf');
const MONTSERRAT_BOLD_PATH = path.join(FONT_DIR, 'Montserrat-Bold.ttf');

const HAS_MONTSERRAT = fs.existsSync(MONTSERRAT_REGULAR_PATH) && fs.existsSync(MONTSERRAT_BOLD_PATH);

function getPdfFonts() {
  if (!HAS_MONTSERRAT) {
    return {
      regular: 'Helvetica',
      bold: 'Helvetica-Bold',
      mono: 'Courier',
    };
  }

  return {
    regular: MONTSERRAT_REGULAR_PATH,
    bold: MONTSERRAT_BOLD_PATH,
    mono: 'Courier',
  };
}

function parseJsonMaybe(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function formatDateRange(startDateLike, endDateLike) {
  if (!startDateLike) return '-';
  const start = new Date(startDateLike);
  if (Number.isNaN(start.getTime())) return String(startDateLike);

  const startText = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(start);

  if (!endDateLike) {
    return `${startText} WIB`;
  }

  const end = new Date(endDateLike);
  if (Number.isNaN(end.getTime())) {
    return `${startText} WIB`;
  }

  const endText = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(end);

  return `${startText} WIB - ${endText} WIB`;
}

function collectDocBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function drawSingleTicketPage(doc, {
  platformName,
  ticket,
  ticketTypeName,
  event,
  eoName,
}) {
  const fonts = getPdfFonts();
  const qrRaw = String(ticket?.qr_code || ticket?.id || '').trim();
  const attendees = parseJsonMaybe(ticket?.attendee_details, []);
  const attendeeRows = Array.isArray(attendees) ? attendees : [];
  const isBundle = Number(ticket?.is_bundle || 0) === 1;
  const qty = Number(ticket?.quantity || 1);
  const qtyLabel = isBundle ? `${qty} orang dalam 1 paket` : `${qty} tiket`;

  const pageW = 640;
  const pageH = 280;
  const cardX = 16;
  const cardY = 16;
  const cardW = pageW - 32;
  const cardH = pageH - 32;

  // ── Colors - PURE BLACK for all text ──
  const BLACK = '#000000';
  const DARK = '#1a1a1a';
  const LINE = '#555555';
  const BG = '#ffffff';

  const qrBuffer = qrRaw
    ? await QRCode.toBuffer(qrRaw, { type: 'png', width: 720, margin: 1 })
    : null;

  // ── Layout zones ──
  const leftX = cardX + 20;
  const leftW = 390;
  const dividerX = 460;
  const qrZoneX = dividerX + 12;
  const qrBoxX = qrZoneX + 10;
  const qrBoxY = cardY + 48;
  const qrBoxSize = 130;

  // ── Card background ──
  doc.save();
  doc.fillColor(BG).roundedRect(cardX, cardY, cardW, cardH, 12).fill();
  doc.restore();

  // ── Card border ──
  doc.lineWidth(1.5).strokeColor(BLACK).roundedRect(cardX, cardY, cardW, cardH, 12).stroke();

  // ── Vertical dashed divider ──
  doc.lineWidth(1).dash(5, { space: 3 }).strokeColor(LINE)
    .moveTo(dividerX, cardY + 12)
    .lineTo(dividerX, cardY + cardH - 12)
    .stroke();
  doc.undash();

  // ══════════════════════════════════
  // LEFT SIDE
  // ══════════════════════════════════

  let y = cardY + 14;

  // Platform name
  doc.font(fonts.bold).fontSize(9).fillColor(BLACK)
    .text(String(platformName || 'EVENTRA').toUpperCase(), leftX, y, { width: leftW });
  y += 14;

  // Event title
  doc.font(fonts.bold).fontSize(20).fillColor(BLACK)
    .text(event?.title || 'Event', leftX, y, { width: leftW, lineGap: 0, ellipsis: true });
  y += 28;

  // Date & location
  doc.font(fonts.bold).fontSize(10).fillColor(DARK)
    .text(formatDateRange(event?.startDate, event?.endDate), leftX, y, { width: leftW });
  y += 14;
  doc.font(fonts.bold).fontSize(10).fillColor(DARK)
    .text(event?.location || '-', leftX, y, { width: leftW });
  y += 16;

  // Horizontal line
  doc.lineWidth(1.5).strokeColor(LINE)
    .moveTo(leftX, y)
    .lineTo(leftX + leftW, y)
    .stroke();
  y += 10;

  // ── Row 1: Tipe Tiket + Jumlah ──
  const col2X = leftX + 240;

  doc.font(fonts.bold).fontSize(9).fillColor(BLACK).text('Tipe Tiket', leftX, y);
  doc.font(fonts.bold).fontSize(9).fillColor(BLACK).text('Jumlah', col2X, y);
  y += 13;
  doc.font(fonts.bold).fontSize(11).fillColor(BLACK)
    .text(ticketTypeName || '-', leftX, y, { width: 220, ellipsis: true });
  doc.font(fonts.bold).fontSize(11).fillColor(BLACK)
    .text(qtyLabel, col2X, y, { width: 160, ellipsis: true });
  y += 18;

  // ── Row 2: Order ID ──
  doc.font(fonts.bold).fontSize(9).fillColor(BLACK).text('Order ID', leftX, y);
  y += 12;
  doc.font(fonts.bold).fontSize(9).fillColor(DARK)
    .text(ticket?.order_id || '-', leftX, y, { width: leftW, ellipsis: true });
  y += 14;

  // ── Row 3: Ticket ID ──
  doc.font(fonts.bold).fontSize(9).fillColor(BLACK).text('Ticket ID', leftX, y);
  y += 12;
  doc.font(fonts.bold).fontSize(9).fillColor(DARK)
    .text(ticket?.id || '-', leftX, y, { width: leftW, ellipsis: true });
  y += 14;

  // ── Row 4: Peserta ──
  doc.font(fonts.bold).fontSize(9).fillColor(BLACK).text('Peserta', leftX, y);
  y += 12;
  if (attendeeRows.length === 0) {
    doc.font(fonts.bold).fontSize(9).fillColor(DARK)
      .text('- Tidak ada data peserta -', leftX, y, { width: leftW });
  } else {
    const previewRows = attendeeRows.slice(0, 3);
    for (let i = 0; i < previewRows.length; i += 1) {
      const attendee = previewRows[i] || {};
      const name = attendee.name || 'Peserta';
      doc.font(fonts.bold).fontSize(9).fillColor(BLACK)
        .text(`${i + 1}. ${name}`, leftX, y, { width: leftW, ellipsis: true });
      y += 12;
    }
    if (attendeeRows.length > 3) {
      doc.font(fonts.bold).fontSize(8).fillColor(DARK)
        .text(`+${attendeeRows.length - 3} peserta lainnya`, leftX, y, { width: leftW });
    }
  }

  // ══════════════════════════════════
  // RIGHT SIDE (QR)
  // ══════════════════════════════════

  // QR CHECK-IN label
  doc.font(fonts.bold).fontSize(10).fillColor(BLACK)
    .text('QR CHECK-IN', qrZoneX, cardY + 22, { width: 150, align: 'center' });

  // QR box border
  doc.lineWidth(1.5).strokeColor(BLACK)
    .roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 8).stroke();

  // QR code image
  if (qrBuffer) {
    doc.image(qrBuffer, qrBoxX + 8, qrBoxY + 8, {
      width: qrBoxSize - 16,
      height: qrBoxSize - 16,
    });
  }

  // QR code text
  doc.font(fonts.bold).fontSize(8).fillColor(BLACK)
    .text(qrRaw || '-', qrZoneX, qrBoxY + qrBoxSize + 8, {
      width: 150,
      align: 'center',
      ellipsis: true,
    });

  // Instruction text
  doc.font(fonts.bold).fontSize(8).fillColor(BLACK)
    .text('Tunjukkan QR ini saat masuk venue', qrZoneX, cardY + cardH - 22, {
      width: 150,
      align: 'center',
    });

  // ══════════════════════════════════
  // EXTRA PAGES for many attendees
  // ══════════════════════════════════
  if (attendeeRows.length > 3) {
    let offset = 3;
    while (offset < attendeeRows.length) {
      doc.addPage({ size: [pageW, pageH], margin: 0 });

      doc.save();
      doc.fillColor(BG).roundedRect(cardX, cardY, cardW, cardH, 12).fill();
      doc.restore();
      doc.lineWidth(1.5).strokeColor(BLACK).roundedRect(cardX, cardY, cardW, cardH, 12).stroke();

      doc.font(fonts.bold).fontSize(14).fillColor(BLACK)
        .text('Daftar Peserta', cardX + 20, cardY + 22, { width: cardW - 40 });
      doc.font(fonts.bold).fontSize(9).fillColor(DARK)
        .text(`${event?.title || 'Event'} — ${ticketTypeName || 'Tiket'}`, cardX + 20, cardY + 40, { width: cardW - 40, ellipsis: true });

      doc.lineWidth(1).strokeColor(LINE)
        .moveTo(cardX + 20, cardY + 56)
        .lineTo(cardX + cardW - 20, cardY + 56)
        .stroke();

      let ay = cardY + 68;
      while (offset < attendeeRows.length && ay < cardY + cardH - 24) {
        const attendee = attendeeRows[offset] || {};
        const idx = offset + 1;
        const name = attendee.name || 'Peserta';
        const email = attendee.email || '-';
        const phone = attendee.phone || '-';
        doc.font(fonts.bold).fontSize(9).fillColor(BLACK)
          .text(`${idx}. ${name}`, cardX + 20, ay, { width: cardW - 40, ellipsis: true });
        doc.font(fonts.bold).fontSize(8).fillColor(DARK)
          .text(`${email} | ${phone}`, cardX + 20, ay + 12, { width: cardW - 40, ellipsis: true });
        ay += 28;
        offset += 1;
      }
    }
  }
}

export async function generateTicketPdfBuffer({
  platformName = 'Eventra',
  ticket,
  ticketTypeName,
  event,
  eoName = '-',
}) {
  const doc = new PDFDocument({ size: [640, 280], margin: 0 });
  const done = collectDocBuffer(doc);

  await drawSingleTicketPage(doc, {
    platformName,
    ticket,
    ticketTypeName,
    event,
    eoName,
  });

  doc.end();
  return done;
}

export async function generateOrderTicketPdfBuffer({
  platformName = 'Eventra',
  tickets = [],
  event,
  eoName = '-',
}) {
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  if (safeTickets.length === 0) {
    return null;
  }

  const doc = new PDFDocument({ size: [640, 280], margin: 0 });
  const done = collectDocBuffer(doc);

  for (let i = 0; i < safeTickets.length; i += 1) {
    const ticket = safeTickets[i];
    if (i > 0) {
      doc.addPage({ size: [640, 280], margin: 0 });
    }

    await drawSingleTicketPage(doc, {
      platformName,
      ticket,
      ticketTypeName: ticket?.ticket_name || 'Tiket',
      event,
      eoName,
    });
  }

  doc.end();
  return done;
}
