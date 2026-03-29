import crypto from 'crypto';
import { persistCustomFormAnswers } from './customForms.js';

function toDbDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getBundleQty(item) {
  if (!Number(item.is_bundle || 0)) return 1;
  const n = Number(item.bundle_qty || 1);
  if (!Number.isFinite(n)) return 1;
  return Math.max(2, Math.min(10, Math.trunc(n)));
}

function buildSingleAttendeeJson(attendee) {
  if (!isObject(attendee)) return null;
  return JSON.stringify([attendee]);
}

function normalizeAttendeeRows(rawAttendees) {
  if (!Array.isArray(rawAttendees)) return [];
  return rawAttendees.map((row) => (isObject(row) ? row : {}));
}

function getBundleAttendees(attendeeRows, start, size) {
  const rows = [];
  for (let i = 0; i < size; i += 1) {
    rows.push(isObject(attendeeRows[start + i]) ? attendeeRows[start + i] : {});
  }
  return rows;
}

export async function generateTicketsForPaidOrder(conn, {
  orderId,
  userId,
  now = toDbDateTime(),
}) {
  const [items] = await conn.query(
    `SELECT oi.*, tt.event_id, tt.is_bundle, tt.bundle_qty, tt.name AS ticket_name
     FROM order_items oi
     JOIN ticket_types tt ON tt.id = oi.ticket_type_id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`,
    [orderId]
  );

  const generatedTickets = [];
  const eventId = items[0]?.event_id || null;

  for (const item of items) {
    const packageQty = Math.max(0, Number(item.quantity || 0));
    const bundleQty = getBundleQty(item);
    const isBundle = Number(item.is_bundle || 0) === 1;

    const attendees = parseJsonMaybe(item.attendee_details, []);
    const attendeeRows = normalizeAttendeeRows(attendees);

    if (isBundle) {
      for (let pkg = 0; pkg < packageQty; pkg += 1) {
        const ticketId = `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`;
        const qrCode = `qr_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const bundleIndex = packageQty > 1 ? pkg + 1 : 1;
        const bundleTotal = packageQty > 1 ? packageQty : 1;

        const start = pkg * bundleQty;
        const bundleAttendees = getBundleAttendees(attendeeRows, start, bundleQty);
        const attendeeJson = JSON.stringify(bundleAttendees);

        await conn.query(
          `INSERT INTO tickets (
            id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at,
            quantity, attendee_details, order_item_id, bundle_index, bundle_total
          ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, ?, ?, ?, ?)`,
          [
            ticketId,
            orderId,
            userId,
            item.ticket_type_id,
            qrCode,
            now,
            Math.max(1, bundleAttendees.length),
            attendeeJson,
            item.id,
            bundleIndex,
            bundleTotal,
          ]
        );

        generatedTickets.push({
          id: ticketId,
          orderId,
          orderItemId: item.id,
          ticketTypeId: item.ticket_type_id,
          attendees: bundleAttendees,
          attendee: bundleAttendees[0] || {},
          bundleIndex,
          bundleTotal,
        });
      }
      continue;
    }

    for (let i = 0; i < packageQty; i += 1) {
      const ticketId = `tkt_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`;
      const qrCode = `qr_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const attendee = isObject(attendeeRows[i]) ? attendeeRows[i] : {};
      const attendeeJson = buildSingleAttendeeJson(attendee);

      await conn.query(
        `INSERT INTO tickets (
          id, order_id, user_id, ticket_type_id, qr_code, status, is_used, created_at,
          quantity, attendee_details, order_item_id, bundle_index, bundle_total
        ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, ?, 1, ?, ?, 1, 1)`,
        [
          ticketId,
          orderId,
          userId,
          item.ticket_type_id,
          qrCode,
          now,
          attendeeJson,
          item.id,
        ]
      );

      generatedTickets.push({
        id: ticketId,
        orderId,
        orderItemId: item.id,
        ticketTypeId: item.ticket_type_id,
        attendee,
        bundleIndex: 1,
        bundleTotal: 1,
      });
    }
  }

  if (eventId) {
    await persistCustomFormAnswers({
      conn,
      eventId,
      orderId,
      generatedTickets,
    });
  }

  return {
    generatedTickets,
    orderItems: items,
  };
}
