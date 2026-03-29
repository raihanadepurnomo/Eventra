import crypto from 'crypto';

const ALLOWED_FIELD_TYPES = new Set(['text', 'number', 'select', 'radio']);
const ALLOWED_APPLIES_TO = new Set(['order', 'per_ticket']);

function asBadRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function parseFieldOptions(rawOptions) {
  const options = parseJsonMaybe(rawOptions, []);
  if (!Array.isArray(options)) return [];
  return options
    .map((opt) => String(opt || '').trim())
    .filter(Boolean);
}

function normalizeAnswerValue(value, field) {
  if (value === undefined || value === null) return null;

  if (field.field_type === 'number') {
    if (value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw asBadRequest(`Jawaban untuk "${field.label}" harus berupa angka.`);
    }
    return String(n);
  }

  const text = String(value).trim();
  if (!text) return null;
  return text;
}

function validateFieldDefinition(field) {
  if (!field.label || !String(field.label).trim()) {
    throw asBadRequest('Label pertanyaan wajib diisi.');
  }

  if (!ALLOWED_FIELD_TYPES.has(field.field_type)) {
    throw asBadRequest('Jenis field tidak valid.');
  }

  if (!ALLOWED_APPLIES_TO.has(field.applies_to)) {
    throw asBadRequest('Konfigurasi applies_to tidak valid.');
  }

  const options = parseFieldOptions(field.options);
  if ((field.field_type === 'select' || field.field_type === 'radio') && options.length === 0) {
    throw asBadRequest(`Field "${field.label}" wajib punya opsi.`);
  }

  return {
    ...field,
    options,
  };
}

function validateAnswerAgainstField(field, rawValue) {
  const normalized = normalizeAnswerValue(rawValue, field);
  if (normalized === null) {
    if (field.is_required) {
      throw asBadRequest(`Pertanyaan wajib "${field.label}" belum diisi.`);
    }
    return null;
  }

  if (field.field_type === 'select' || field.field_type === 'radio') {
    if (!field.options.includes(normalized)) {
      throw asBadRequest(`Jawaban untuk "${field.label}" tidak valid.`);
    }
  }

  return normalized;
}

export async function getEventCustomFormFields(conn, eventId) {
  const [rows] = await conn.query(
    `SELECT id, event_id, label, field_type, options, is_required, applies_to, sort_order
     FROM custom_form_fields
     WHERE event_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [eventId]
  );

  return rows.map((row) => {
    const parsed = validateFieldDefinition(row);
    return {
      ...row,
      label: String(row.label || ''),
      field_type: parsed.field_type,
      options: parsed.options,
      is_required: Boolean(row.is_required),
      applies_to: parsed.applies_to,
      sort_order: Number(row.sort_order || 0),
    };
  });
}

export async function eventHasPaidTicketSales(conn, eventId) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN ticket_types tt ON tt.id = oi.ticket_type_id
     WHERE tt.event_id = ?
       AND o.status = 'PAID'`,
    [eventId]
  );

  return Number(rows[0]?.total || 0) > 0;
}

function buildPerTicketExpectations(normalizedItems) {
  const ticketCounts = new Map();

  for (const item of normalizedItems) {
    const bundleQty = Math.max(1, Number(item.bundleQty || 1));
    const quantity = Math.max(0, Number(item.quantity || 0));
    ticketCounts.set(item.ticketTypeId, quantity * bundleQty);
  }

  return ticketCounts;
}

export function validateAndNormalizeCustomFormSubmission({
  fields,
  formAnswers,
  normalizedItems,
}) {
  const perOrderFields = fields.filter((field) => field.applies_to === 'order');
  const perTicketFields = fields.filter((field) => field.applies_to === 'per_ticket');

  if (!perOrderFields.length && !perTicketFields.length) {
    return {
      perOrderAnswers: {},
      perTicketAnswers: {},
    };
  }

  const raw = isObject(formAnswers) ? formAnswers : {};
  const rawPerOrder = isObject(raw.per_order) ? raw.per_order : {};
  const rawPerTicket = isObject(raw.per_ticket) ? raw.per_ticket : {};

  const perOrderAnswers = {};
  for (const field of perOrderFields) {
    const normalized = validateAnswerAgainstField(field, rawPerOrder[field.id]);
    if (normalized !== null) {
      perOrderAnswers[field.id] = normalized;
    }
  }

  const perTicketAnswers = {};
  const expectedTicketCounts = buildPerTicketExpectations(normalizedItems);

  for (const item of normalizedItems) {
    const expectedCount = Number(expectedTicketCounts.get(item.ticketTypeId) || 0);
    const ticketRows = Array.isArray(rawPerTicket[item.ticketTypeId])
      ? rawPerTicket[item.ticketTypeId]
      : [];

    if (perTicketFields.length > 0 && ticketRows.length < expectedCount) {
      throw asBadRequest(`Jawaban form untuk tiket ${item.ticketName} belum lengkap.`);
    }

    const normalizedRows = [];
    for (let i = 0; i < expectedCount; i += 1) {
      const rawRow = isObject(ticketRows[i]) ? ticketRows[i] : {};
      const normalizedRow = {};

      for (const field of perTicketFields) {
        const normalized = validateAnswerAgainstField(field, rawRow[field.id]);
        if (normalized !== null) {
          normalizedRow[field.id] = normalized;
        }
      }

      normalizedRows.push(normalizedRow);
    }

    perTicketAnswers[item.ticketTypeId] = normalizedRows;
  }

  return { perOrderAnswers, perTicketAnswers };
}

export function mergeCustomFormAnswersIntoOrderItems({
  normalizedItems,
  perOrderAnswers,
  perTicketAnswers,
}) {
  const hasPerOrderAnswers = Object.keys(perOrderAnswers || {}).length > 0;

  for (const item of normalizedItems) {
    const bundleQty = Math.max(1, Number(item.bundleQty || 1));
    const totalTickets = Math.max(0, Number(item.quantity || 0)) * bundleQty;

    const parsed = parseJsonMaybe(item.attendeeJson, []);
    const attendees = Array.isArray(parsed) ? [...parsed] : [];

    const answerRows = Array.isArray(perTicketAnswers?.[item.ticketTypeId])
      ? perTicketAnswers[item.ticketTypeId]
      : [];
    const hasPerTicketRows = Array.isArray(perTicketAnswers?.[item.ticketTypeId]);

    for (let idx = 0; idx < totalTickets; idx += 1) {
      const existing = isObject(attendees[idx]) ? { ...attendees[idx] } : {};
      const ticketAnswers = isObject(answerRows[idx]) ? answerRows[idx] : {};

      if (hasPerTicketRows) {
        existing._custom_answers = ticketAnswers;
      }

      if (hasPerOrderAnswers) {
        existing._order_answers = perOrderAnswers;
      }

      attendees[idx] = existing;
    }

    item.attendeeJson = attendees.length > 0 ? JSON.stringify(attendees) : null;
  }
}

export async function persistCustomFormAnswers({
  conn,
  eventId,
  orderId,
  generatedTickets,
}) {
  const fields = await getEventCustomFormFields(conn, eventId);
  if (!fields.length) return;

  const perOrderFields = fields.filter((field) => field.applies_to === 'order');
  const perTicketFields = fields.filter((field) => field.applies_to === 'per_ticket');

  await conn.query('DELETE FROM custom_form_answers WHERE order_id = ?', [orderId]);

  let orderAnswerSource = {};
  for (const ticket of generatedTickets) {
    const attendeeRows = Array.isArray(ticket?.attendees)
      ? ticket.attendees
      : [ticket?.attendee];
    for (const row of attendeeRows) {
      if (isObject(row?._order_answers)) {
        orderAnswerSource = row._order_answers;
        break;
      }
    }
    if (Object.keys(orderAnswerSource).length > 0) {
      break;
    }
  }

  for (const field of perOrderFields) {
    const answer = validateAnswerAgainstField(field, orderAnswerSource[field.id]);
    if (answer === null) continue;

    await conn.query(
      `INSERT INTO custom_form_answers (id, field_id, order_id, ticket_id, answer)
       VALUES (?, ?, ?, NULL, ?)`,
      [crypto.randomUUID(), field.id, orderId, answer]
    );
  }

  for (const ticket of generatedTickets) {
    const attendeeRows = Array.isArray(ticket?.attendees)
      ? ticket.attendees
      : [ticket?.attendee];

    for (const attendee of attendeeRows) {
      const customAnswers = isObject(attendee?._custom_answers)
        ? attendee._custom_answers
        : {};

      for (const field of perTicketFields) {
        const answer = validateAnswerAgainstField(field, customAnswers[field.id]);
        if (answer === null) continue;

        await conn.query(
          `INSERT INTO custom_form_answers (id, field_id, order_id, ticket_id, answer)
           VALUES (?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), field.id, orderId, ticket.id, answer]
        );
      }
    }
  }
}
