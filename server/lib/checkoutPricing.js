import crypto from 'crypto';

function asBadRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWithinRange(targetDate, startDate, endDate) {
  const target = toDate(targetDate) || new Date();
  const start = toDate(startDate);
  const end = toDate(endDate);

  const startOk = !start || start <= target;
  const endOk = !end || end >= target;
  return startOk && endOk;
}

function parseAppliesTo(appliesTo) {
  if (!appliesTo) return null;
  if (Array.isArray(appliesTo)) return appliesTo.map(String);

  if (typeof appliesTo === 'string') {
    try {
      const parsed = JSON.parse(appliesTo);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function normalizePromoCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function calculatePromoDiscount(promo, subtotal) {
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  if (!promo || safeSubtotal <= 0) return 0;

  let discount = 0;
  if (promo.discount_type === 'percentage') {
    discount = Math.round((safeSubtotal * Number(promo.discount_value || 0)) / 100);
    if (promo.max_discount !== null && promo.max_discount !== undefined) {
      discount = Math.min(discount, Number(promo.max_discount));
    }
  } else {
    discount = Number(promo.discount_value || 0);
  }

  return Math.min(Math.max(0, discount), safeSubtotal);
}

export async function getActivePricingPhase(conn, ticketTypeId, referenceDate = new Date()) {
  const [phaseRows] = await conn.query(
    `SELECT id, ticket_type_id, phase_name, price, quota, quota_sold, start_date, end_date
     FROM ticket_pricing_phases
     WHERE ticket_type_id = ?
     ORDER BY start_date ASC, created_at ASC`,
    [ticketTypeId]
  );

  if (!phaseRows.length) {
    return { hasPhases: false, activePhase: null };
  }

  for (const phase of phaseRows) {
    const inDateRange = isWithinRange(referenceDate, phase.start_date, phase.end_date);
    const quotaOk = phase.quota === null || Number(phase.quota_sold || 0) < Number(phase.quota);
    if (inDateRange && quotaOk) {
      return { hasPhases: true, activePhase: phase };
    }
  }

  return { hasPhases: true, activePhase: null };
}

export async function enrichTicketTypeWithActivePricing(conn, ticketTypeRow, referenceDate = new Date()) {
  const { hasPhases, activePhase } = await getActivePricingPhase(conn, ticketTypeRow.id, referenceDate);
  const fallbackPrice = Number(ticketTypeRow.price || 0);
  const baseSaleActive = isWithinRange(referenceDate, ticketTypeRow.sale_start_date, ticketTypeRow.sale_end_date);
  const activePhasePrice = activePhase ? Number(activePhase.price || 0) : null;
  const useFallbackBecauseZeroPhasePrice = Boolean(activePhase) && activePhasePrice <= 0 && fallbackPrice > 0;
  const effectivePrice = activePhase
    ? (useFallbackBecauseZeroPhasePrice ? fallbackPrice : activePhasePrice)
    : fallbackPrice;
  const hasSellablePrice = (Boolean(activePhase) || baseSaleActive) && effectivePrice >= 0;

  return {
    ...ticketTypeRow,
    has_pricing_phases: hasPhases ? 1 : 0,
    active_phase_id: activePhase?.id || null,
    active_phase_name: activePhase?.phase_name || null,
    active_phase_price: activePhasePrice,
    active_phase_end_date: activePhase?.end_date || null,
    active_phase_quota_remaining:
      activePhase && activePhase.quota !== null
        ? Math.max(0, Number(activePhase.quota) - Number(activePhase.quota_sold || 0))
        : null,
    effective_price: effectivePrice,
    is_price_unavailable: hasSellablePrice ? 0 : 1,
  };
}

export async function buildOrderPricingContext(conn, items, userId, lockTicketRows = true) {
  if (!Array.isArray(items) || items.length === 0) {
    throw asBadRequest('Item pesanan tidak boleh kosong');
  }

  const normalizedItems = [];
  let subtotal = 0;
  let eventId = null;

  for (const item of items) {
    const ticketTypeId = String(item.ticket_type_id || '').trim();
    const quantity = Number(item.quantity);

    if (!ticketTypeId) {
      throw asBadRequest('ticket_type_id wajib diisi');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw asBadRequest('Quantity tiket harus bilangan bulat lebih dari 0');
    }
    if (normalizedItems.some((normalizedItem) => normalizedItem.ticketTypeId === ticketTypeId)) {
      throw asBadRequest('Satu jenis tiket hanya boleh muncul sekali dalam pesanan');
    }

    const lockClause = lockTicketRows ? 'FOR UPDATE' : '';
    const [ticketRows] = await conn.query(
      `SELECT id, event_id, name, price, quota, sold, max_per_order, max_per_account,
              sale_start_date, sale_end_date, is_bundle, bundle_qty
       FROM ticket_types
       WHERE id = ?
       ${lockClause}`,
      [ticketTypeId]
    );

    if (!ticketRows.length) {
      throw asBadRequest(`Jenis tiket ${ticketTypeId} tidak ditemukan`);
    }

    const ticketType = ticketRows[0];
    if (!eventId) {
      eventId = ticketType.event_id;
    } else if (eventId !== ticketType.event_id) {
      throw asBadRequest('Semua tiket dalam satu checkout harus dari event yang sama');
    }

    const maxPerOrder = Number(ticketType.max_per_order || 0);
    const maxPerAccount = Number(ticketType.max_per_account || 0);
    const sold = Number(ticketType.sold || 0);
    const quota = Number(ticketType.quota || 0);

    if (maxPerOrder > 0 && quantity > maxPerOrder) {
      throw asBadRequest(`Maksimal pembelian untuk tiket ${ticketType.name} adalah ${maxPerOrder} tiket per transaksi.`);
    }

    const remainingQuota = quota - sold;
    if (quantity > remainingQuota) {
      throw asBadRequest(`Kuota tiket ${ticketType.name} tidak mencukupi. Sisa kuota ${Math.max(0, remainingQuota)} tiket.`);
    }

    if (maxPerAccount > 0) {
      let totalOwned = 0;
      if (Number(ticketType.is_bundle || 0)) {
        const [ownedRows] = await conn.query(
          `SELECT COUNT(*) AS total_owned
           FROM tickets t
           JOIN orders o ON o.id = t.order_id
           WHERE t.ticket_type_id = ?
             AND t.user_id = ?
             AND o.status = 'PAID'
             AND t.status NOT IN ('CANCELLED', 'TRANSFERRED')`,
          [ticketTypeId, userId]
        );
        totalOwned = Number(ownedRows[0]?.total_owned || 0);
      } else {
        const [ownedRows] = await conn.query(
          `SELECT COALESCE(SUM(t.quantity), 0) AS total_owned
           FROM tickets t
           JOIN orders o ON o.id = t.order_id
           WHERE t.ticket_type_id = ?
             AND t.user_id = ?
             AND o.status = 'PAID'
             AND t.status NOT IN ('CANCELLED', 'TRANSFERRED')`,
          [ticketTypeId, userId]
        );
        totalOwned = Number(ownedRows[0]?.total_owned || 0);
      }

      const totalAfterPurchase = totalOwned + quantity;
      if (totalAfterPurchase > maxPerAccount) {
        const remainingAllowed = Math.max(0, maxPerAccount - totalOwned);
        throw asBadRequest(
          `Batas pembelian untuk tiket ${ticketType.name} adalah ${maxPerAccount} tiket per akun. ` +
          `Kamu sudah memiliki ${totalOwned} tiket. Kamu hanya bisa membeli ${remainingAllowed} tiket lagi.`
        );
      }
    }

    const referenceDate = new Date();
    const { activePhase } = await getActivePricingPhase(conn, ticketTypeId, referenceDate);
    const baseSaleActive = isWithinRange(referenceDate, ticketType.sale_start_date, ticketType.sale_end_date);
    if (!activePhase && !baseSaleActive) {
      throw asBadRequest(`Tiket ${ticketType.name} saat ini belum / tidak dalam masa penjualan.`);
    }

    const attendeeJson = item.attendee_details
      ? (typeof item.attendee_details === 'string' ? item.attendee_details : JSON.stringify(item.attendee_details))
      : null;
    const unitPrice = activePhase ? Number(activePhase.price || 0) : Number(ticketType.price || 0);
    const itemSubtotal = unitPrice * quantity;

    subtotal += itemSubtotal;

    normalizedItems.push({
      id: `oi_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`,
      ticketTypeId,
      eventId: ticketType.event_id,
      ticketName: ticketType.name,
      quantity,
      isBundle: Number(ticketType.is_bundle || 0) === 1,
      bundleQty: Number(ticketType.is_bundle || 0) === 1
        ? Math.max(2, Math.min(10, Number(ticketType.bundle_qty || 1)))
        : 1,
      unitPrice,
      subtotal: itemSubtotal,
      attendeeJson,
      activePhaseId: activePhase?.id || null,
      activePhaseName: activePhase?.phase_name || null,
    });
  }

  return { normalizedItems, subtotal, eventId };
}

export async function validateAndComputePromo(conn, {
  promoCode,
  eventId,
  userId,
  normalizedItems,
  subtotal,
  lockPromo = false,
}) {
  const normalizedCode = normalizePromoCode(promoCode);
  if (!normalizedCode) {
    return {
      promo: null,
      discountAmount: 0,
      normalizedCode: null,
      message: null,
    };
  }

  const lockClause = lockPromo ? 'FOR UPDATE' : '';
  const [promoRows] = await conn.query(
    `SELECT * FROM promo_codes WHERE event_id = ? AND code = ? LIMIT 1 ${lockClause}`,
    [eventId, normalizedCode]
  );

  if (!promoRows.length) {
    throw asBadRequest('Kode promo tidak ditemukan untuk event ini.');
  }

  const promo = promoRows[0];
  const now = new Date();

  if (!promo.is_active) {
    throw asBadRequest('Kode promo tidak aktif.');
  }

  if (!isWithinRange(now, promo.start_date, promo.end_date)) {
    throw asBadRequest('Kode promo tidak berada dalam masa berlaku.');
  }

  if (promo.quota !== null && Number(promo.used_count || 0) >= Number(promo.quota)) {
    throw asBadRequest('Kode promo sudah mencapai batas pemakaian.');
  }

  const [usageRows] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM promo_code_usages
     WHERE promo_code_id = ? AND user_id = ?`,
    [promo.id, userId]
  );
  const totalUserUsage = Number(usageRows[0]?.total || 0);
  const maxPerUser = Math.max(1, Number(promo.max_per_user || 1));
  if (totalUserUsage >= maxPerUser) {
    throw asBadRequest('Batas penggunaan kode promo untuk akun kamu sudah tercapai.');
  }

  const appliesToTicketIds = parseAppliesTo(promo.applies_to);
  const applicableSubtotal = Array.isArray(appliesToTicketIds)
    ? normalizedItems
        .filter((item) => appliesToTicketIds.includes(item.ticketTypeId))
        .reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
    : Number(subtotal || 0);

  if (Array.isArray(appliesToTicketIds) && applicableSubtotal <= 0) {
    throw asBadRequest('Kode promo tidak berlaku untuk tiket yang dipilih.');
  }

  if (applicableSubtotal < Number(promo.min_purchase || 0)) {
    throw asBadRequest(`Minimal pembelian untuk kode promo ini adalah Rp ${Number(promo.min_purchase || 0).toLocaleString('id-ID')}.`);
  }

  const discountAmount = calculatePromoDiscount(promo, applicableSubtotal);

  return {
    promo,
    discountAmount,
    normalizedCode,
    message: promo.description || null,
  };
}

export async function finalizePaidOrderAccounting(conn, orderRow, orderItems, userId) {
  for (const item of orderItems) {
    if (item.active_phase_id) {
      await conn.query(
        `UPDATE ticket_pricing_phases
         SET quota_sold = quota_sold + ?
         WHERE id = ?`,
        [Number(item.quantity || 0), item.active_phase_id]
      );
    }
  }

  if (orderRow.promo_code_id) {
    const [usageRows] = await conn.query(
      'SELECT id FROM promo_code_usages WHERE order_id = ? LIMIT 1',
      [orderRow.id]
    );

    if (!usageRows.length) {
      const usageId = crypto.randomUUID();
      await conn.query(
        `INSERT INTO promo_code_usages (id, promo_code_id, user_id, order_id, discount_amount, used_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [usageId, orderRow.promo_code_id, userId, orderRow.id, Number(orderRow.discount_amount || 0)]
      );

      await conn.query(
        `UPDATE promo_codes
         SET used_count = used_count + 1
         WHERE id = ?`,
        [orderRow.promo_code_id]
      );
    }
  }
}

export function toBadRequestError(message) {
  return asBadRequest(message);
}
