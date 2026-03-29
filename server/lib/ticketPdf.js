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
      italic: 'Helvetica-Oblique',
      mono: 'Courier',
    };
  }

  return {
    regular: MONTSERRAT_REGULAR_PATH,
    bold: MONTSERRAT_BOLD_PATH,
    italic: MONTSERRAT_REGULAR_PATH,
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
  const colors = {
    border: '#111827',
    text: '#111827',
    textSoft: '#1f2937',
    bg: '#ffffff',
    lightLine: '#d1d5db',
  };

  const qrBuffer = qrRaw
    ? await QRCode.toBuffer(qrRaw, { type: 'png', width: 720, margin: 1 })
    : null;

  const leftX = cardX + 18;
  const leftW = 404;
  const qrZoneX = 466;
  const qrBoxX = qrZoneX + 12;
  const qrBoxY = cardY + 46;
  const qrBoxSize = 132;

  doc.save();
  doc.fillColor(colors.bg).roundedRect(cardX, cardY, cardW, cardH, 14).fill();
  doc.restore();
  doc.lineWidth(1.2).strokeColor(colors.border).roundedRect(cardX, cardY, cardW, cardH, 14).stroke();

  doc.lineWidth(1).dash(4, { space: 4 }).strokeColor(colors.lightLine)
    .moveTo(qrZoneX - 6, cardY + 14)
    .lineTo(qrZoneX - 6, cardY + cardH - 14)
    .stroke();
  doc.undash();

  doc.fillColor(colors.text).font(fonts.bold).fontSize(10)
    .text(String(platformName || 'Eventra').toUpperCase(), leftX, cardY + 12, { width: leftW });

  doc.font(fonts.bold).fontSize(22).fillColor(colors.text)
    .text(event?.title || 'Event', leftX, cardY + 26, { width: leftW, ellipsis: true });

  doc.font(fonts.regular).fontSize(11).fillColor(colors.textSoft)
    .text(formatDateRange(event?.startDate, event?.endDate), leftX, cardY + 56, { width: leftW, ellipsis: true });
  doc.text(event?.location || '-', leftX, cardY + 72, { width: leftW, ellipsis: true });

  doc.lineWidth(1).strokeColor(colors.lightLine)
    .moveTo(leftX, cardY + 92)
    .lineTo(leftX + leftW, cardY + 92)
    .stroke();

  const rightMetaX = leftX + 220;
  doc.font(fonts.bold).fontSize(9).fillColor(colors.text).text('Tipe Tiket', leftX, cardY + 104);
  doc.font(fonts.regular).fontSize(10).text(ticketTypeName || '-', leftX, cardY + 116, { width: 200, ellipsis: true });

  doc.font(fonts.bold).fontSize(9).text('Jumlah', rightMetaX, cardY + 104);
  doc.font(fonts.regular).fontSize(10).text(qtyLabel, rightMetaX, cardY + 116, { width: 190, ellipsis: true });

  doc.font(fonts.bold).fontSize(9).text('Order ID', leftX, cardY + 136);
  doc.font(fonts.regular).fontSize(9).text(ticket?.order_id || '-', leftX, cardY + 148, { width: leftW, ellipsis: true });

  doc.font(fonts.bold).fontSize(9).text('Ticket ID', leftX, cardY + 166);
  doc.font(fonts.regular).fontSize(9).text(ticket?.id || '-', leftX, cardY + 178, { width: leftW, ellipsis: true });

  doc.font(fonts.bold).fontSize(9).text('Peserta', leftX, cardY + 198);
  if (attendeeRows.length === 0) {
    doc.font(fonts.regular).fontSize(9).text('- Tidak ada data peserta -', leftX, cardY + 210, { width: leftW });
  } else {
    const previewRows = attendeeRows.slice(0, 3);
    let rowY = cardY + 210;
    for (let i = 0; i < previewRows.length; i += 1) {
      const attendee = previewRows[i] || {};
      const name = attendee.name || 'Peserta';
      const line = `${i + 1}. ${name}`;
      doc.font(fonts.regular).fontSize(9).text(line, leftX, rowY, { width: leftW, ellipsis: true });
      rowY += 12;
    }
    if (attendeeRows.length > 3) {
      doc.font(fonts.regular).fontSize(8).text(`+${attendeeRows.length - 3} peserta lainnya ada di halaman berikutnya`, leftX, rowY + 2, { width: leftW });
    }
  }

  doc.font(fonts.bold).fontSize(10).fillColor(colors.text)
    .text('QR CHECK-IN', qrZoneX + 30, cardY + 24, { width: 120, align: 'center' });

  doc.save();
  doc.lineWidth(1).strokeColor(colors.border).roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 10).stroke();
  doc.restore();
  if (qrBuffer) {
    doc.image(qrBuffer, qrBoxX + 10, qrBoxY + 10, { width: qrBoxSize - 20, height: qrBoxSize - 20 });
  }

  doc.fillColor(colors.text).font(fonts.regular).fontSize(8)
    .text(qrRaw || '-', qrZoneX + 8, qrBoxY + qrBoxSize + 10, { width: 146, align: 'center', ellipsis: true });

  doc.font(fonts.regular).fontSize(8).fillColor(colors.text)
    .text('Tunjukkan QR ini saat masuk venue', qrZoneX + 8, cardY + cardH - 24, { width: 146, align: 'center' });

  if (attendeeRows.length > 3) {
    let offset = 3;
    while (offset < attendeeRows.length) {
      doc.addPage({ size: [pageW, pageH], margin: 0 });

      doc.save();
      doc.fillColor(colors.bg).roundedRect(cardX, cardY, cardW, cardH, 14).fill();
      doc.restore();
      doc.lineWidth(1.2).strokeColor(colors.border).roundedRect(cardX, cardY, cardW, cardH, 14).stroke();

      doc.font(fonts.bold).fontSize(15).fillColor(colors.text)
        .text('Daftar Peserta', cardX + 20, cardY + 22, { width: cardW - 40 });
      doc.font(fonts.regular).fontSize(9).fillColor(colors.textSoft)
        .text(`${event?.title || 'Event'} • ${ticketTypeName || 'Tiket'}`, cardX + 20, cardY + 42, { width: cardW - 40, ellipsis: true });

      doc.lineWidth(1).strokeColor(colors.lightLine)
        .moveTo(cardX + 20, cardY + 58)
        .lineTo(cardX + cardW - 20, cardY + 58)
        .stroke();

      let y = cardY + 74;
      while (offset < attendeeRows.length && y < cardY + cardH - 24) {
        const attendee = attendeeRows[offset] || {};
        const idx = offset + 1;
        const name = attendee.name || 'Peserta';
        const email = attendee.email || '-';
        const phone = attendee.phone || '-';
        doc.font(fonts.bold).fontSize(9).fillColor(colors.text)
          .text(`${idx}. ${name}`, cardX + 20, y, { width: cardW - 40, ellipsis: true });
        doc.font(fonts.regular).fontSize(8).fillColor(colors.textSoft)
          .text(`${email} | ${phone}`, cardX + 20, y + 12, { width: cardW - 40, ellipsis: true });
        y += 30;
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
