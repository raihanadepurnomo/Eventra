// Database snake_case to frontend camelCase mappers
import type { Event, TicketType, EOProfile, Order, OrderItem, Ticket, ResaleListing, User, ResaleOrder, SellerBalance, SellerBalanceTransaction, Withdrawal, PromoCode, TicketPricingPhase, CustomFormField } from '@/types'

type RawRow = Record<string, unknown>

export function mapEvent(e: RawRow): Event {
  return {
    id: e.id as string, eoProfileId: (e.eo_profile_id ?? e.eoProfileId) as string,
    title: e.title as string, description: e.description as string, category: e.category as string,
    bannerImage: (e.banner_image ?? e.bannerImage) as string | undefined,
    location: e.location as string, locationUrl: (e.location_url ?? e.locationUrl) as string | undefined,
    startDate: (e.start_date ?? e.startDate) as string, endDate: (e.end_date ?? e.endDate) as string,
    status: e.status as Event['status'],
    isResaleAllowed: !!(e.is_resale_allowed ?? e.isResaleAllowed),
    createdAt: (e.created_at ?? e.createdAt) as string, updatedAt: (e.updated_at ?? e.updatedAt) as string,
  }
}

export function mapUser(u: RawRow): User {
  return {
    id: u.id as string, email: u.email as string, name: u.name as string | undefined,
    isEmailVerified: u.is_email_verified !== undefined ? Boolean(u.is_email_verified) : (u.isEmailVerified as boolean | undefined),
    image: (u.image ?? u.avatar_url ?? u.avatarUrl) as string | undefined,
    phone: (u.phone ?? u.phone_number) as string | undefined,
    role: u.role as User['role'],
    username: u.username as string | undefined,
    usernameChangedAt: (u.username_changed_at ?? u.usernameChangedAt) as string | undefined,
    isProfilePublic: u.is_profile_public !== undefined ? Boolean(u.is_profile_public) : undefined,
    bio: u.bio as string | undefined,
    instagramHandle: (u.instagram_handle ?? u.instagramHandle) as string | undefined,
    createdAt: (u.created_at ?? u.createdAt) as string,
    updatedAt: (u.updated_at ?? u.updatedAt) as string | undefined,
  }
}

export function mapTicketType(t: RawRow): TicketType {
  const isBundle = !!(t.is_bundle ?? t.isBundle)
  const rawBundleQty = Number(t.bundle_qty ?? t.bundleQty ?? 1)

  return {
    id: t.id as string, eventId: (t.event_id ?? t.eventId) as string,
    name: t.name as string, description: t.description as string | undefined,
    price: Number(t.price), quota: Number(t.quota), sold: Number(t.sold),
    effectivePrice: Number(t.effective_price ?? t.effectivePrice ?? t.active_phase_price ?? t.activePhasePrice ?? t.price ?? 0),
    maxPerOrder: Number(t.max_per_order ?? t.maxPerOrder ?? 5),
    maxPerAccount: Number(t.max_per_account ?? t.maxPerAccount ?? 0),
    isBundle,
    bundleQty: isBundle ? Math.max(2, rawBundleQty || 2) : 1,
    hasPricingPhases: !!(t.has_pricing_phases ?? t.hasPricingPhases),
    isPriceUnavailable: !!(t.is_price_unavailable ?? t.isPriceUnavailable),
    activePhaseId: (t.active_phase_id ?? t.activePhaseId) as string | undefined,
    activePhaseName: (t.active_phase_name ?? t.activePhaseName) as string | undefined,
    activePhasePrice: t.active_phase_price !== undefined || t.activePhasePrice !== undefined
      ? Number(t.active_phase_price ?? t.activePhasePrice)
      : undefined,
    activePhaseEndDate: (t.active_phase_end_date ?? t.activePhaseEndDate) as string | undefined,
    activePhaseQuotaRemaining:
      t.active_phase_quota_remaining !== undefined || t.activePhaseQuotaRemaining !== undefined
        ? Number(t.active_phase_quota_remaining ?? t.activePhaseQuotaRemaining)
        : null,
    saleStartDate: (t.sale_start_date ?? t.saleStartDate) as string,
    saleEndDate: (t.sale_end_date ?? t.saleEndDate) as string,
  }
}

export function mapEOProfile(p: RawRow): EOProfile {
  return {
    id: p.id as string, userId: (p.user_id ?? p.userId) as string,
    orgName: (p.org_name ?? p.orgName) as string,
    description: p.description as string | undefined, phone: p.phone as string | undefined,
    status: p.status as EOProfile['status'],
    createdAt: (p.created_at ?? p.createdAt) as string,
  }
}

export function mapOrder(o: RawRow): Order {
  return {
    id: o.id as string, userId: (o.user_id ?? o.userId) as string,
    totalAmount: Number(o.total_amount ?? o.total_paid ?? o.totalAmount),
    discountAmount: Number(o.discount_amount ?? o.discountAmount ?? 0),
    promoCodeId: (o.promo_code_id ?? o.promoCodeId) as string | undefined,
    promoCode: (o.promo_code ?? o.promoCode) as string | undefined,
    status: o.status as Order['status'],
    paymentMethod: (o.payment_method ?? o.paymentMethod) as string | undefined,
    paymentToken: (o.payment_token ?? o.paymentToken) as string | undefined,
    paidAt: (o.paid_at ?? o.paidAt) as string | undefined,
    expiredAt: (o.expired_at ?? o.expiredAt) as string,
    createdAt: (o.created_at ?? o.createdAt) as string,
  }
}

export function mapOrderItem(oi: RawRow): OrderItem {
  let details = oi.attendee_details ?? oi.attendeeDetails
  if (typeof details === 'string' && (details.startsWith('[') || details.startsWith('{'))) {
    try { details = JSON.parse(details) } catch {}
  }
  return {
    id: oi.id as string, orderId: (oi.order_id ?? oi.orderId) as string,
    ticketTypeId: (oi.ticket_type_id ?? oi.ticketTypeId) as string,
    quantity: Number(oi.quantity), unitPrice: Number(oi.unit_price ?? oi.unitPrice),
    subtotal: Number(oi.subtotal),
    activePhaseId: (oi.active_phase_id ?? oi.activePhaseId) as string | undefined,
    activePhaseName: (oi.active_phase_name ?? oi.activePhaseName) as string | undefined,
    attendeeDetails: details as string | any[] | undefined
  }
}

export function mapTicket(t: RawRow): Ticket {
  let details = t.attendee_details ?? t.attendeeDetails
  if (typeof details === 'string' && (details.startsWith('[') || details.startsWith('{'))) {
    try { details = JSON.parse(details) } catch {}
  }
  return {
    id: t.id as string, orderId: (t.order_id ?? t.orderId) as string,
    orderItemId: (t.order_item_id ?? t.orderItemId) as string | undefined,
    userId: (t.user_id ?? t.userId) as string,
    ticketTypeId: (t.ticket_type_id ?? t.ticketTypeId) as string,
    qrCode: (t.qr_code ?? t.qrCode) as string,
    status: t.status as Ticket['status'], isUsed: Boolean(t.is_used ?? t.isUsed),
    usedAt: (t.used_at ?? t.usedAt) as string | undefined,
    createdAt: (t.created_at ?? t.createdAt) as string,
    quantity: Number(t.quantity ?? 1),
    bundleIndex: Number(t.bundle_index ?? t.bundleIndex ?? 1),
    bundleTotal: Number(t.bundle_total ?? t.bundleTotal ?? 1),
    attendeeDetails: details as string | any[] | undefined
  }
}

export function mapCustomFormField(field: RawRow): CustomFormField {
  let options = field.options
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options)
    } catch {
      options = []
    }
  }

  return {
    id: String(field.id || ''),
    eventId: String(field.event_id ?? field.eventId ?? ''),
    label: String(field.label || ''),
    fieldType: (field.field_type ?? field.fieldType ?? 'text') as CustomFormField['fieldType'],
    options: Array.isArray(options) ? options.map((opt) => String(opt)) : [],
    isRequired: Boolean(field.is_required ?? field.isRequired ?? true),
    appliesTo: (field.applies_to ?? field.appliesTo ?? 'per_ticket') as CustomFormField['appliesTo'],
    sortOrder: Number(field.sort_order ?? field.sortOrder ?? 0),
  }
}

export function mapResaleListing(r: RawRow): ResaleListing {
  return {
    id: r.id as string,
    ticketId: (r.ticket_id ?? r.ticketId) as string,
    sellerId: (r.seller_id ?? r.sellerId) as string,
    originalPrice: Number(r.original_price ?? r.originalPrice),
    askingPrice: Number(r.asking_price ?? r.askingPrice),
    maxAllowedPrice: Number(r.max_allowed_price ?? r.maxAllowedPrice),
    platformFee: Number(r.platform_fee ?? r.platformFee),
    sellerReceives: Number(r.seller_receives ?? r.sellerReceives),
    note: r.note as string | undefined,
    status: r.status as ResaleListing['status'],
    listedAt: (r.listed_at ?? r.listedAt ?? r.created_at ?? r.createdAt) as string,
    soldAt: (r.sold_at ?? r.soldAt) as string | undefined,
    cancelledAt: (r.cancelled_at ?? r.cancelledAt) as string | undefined,
    expiredAt: (r.expired_at ?? r.expiredAt) as string,
    
    // Enriched
    ticketTypeName: r.ticket_type_name as string | undefined,
    eventTitle: r.event_title as string | undefined,
    sellerUsername: r.seller_username as string | undefined,
    sellerName: r.seller_name as string | undefined,
    sellerAvatar: (r.seller_avatar ?? r.seller_image) as string | undefined,
  }
}

export function mapResaleOrder(ro: RawRow): ResaleOrder {
  return {
    id: ro.id as string,
    resaleListingId: (ro.resale_listing_id ?? ro.resaleListingId) as string,
    buyerId: (ro.buyer_id ?? ro.buyerId) as string,
    totalPaid: Number(ro.total_paid ?? ro.totalPaid),
    platformFee: Number(ro.platform_fee ?? ro.platformFee),
    sellerReceives: Number(ro.seller_receives ?? ro.sellerReceives),
    status: ro.status as ResaleOrder['status'],
    paymentToken: (ro.payment_token ?? ro.paymentToken) as string | undefined,
    midtransOrderId: (ro.midtrans_order_id ?? ro.midtransOrderId) as string | undefined,
    paymentMethod: (ro.payment_method ?? ro.paymentMethod) as string | undefined,
    paidAt: (ro.paid_at ?? ro.paidAt) as string | undefined,
    expiredAt: (ro.expired_at ?? ro.expiredAt) as string,
    createdAt: (ro.created_at ?? ro.createdAt) as string,
  }
}

export function mapSellerBalance(b: RawRow): SellerBalance {
  return {
    id: b.id as string,
    userId: (b.user_id ?? b.userId) as string,
    balance: Number(b.balance),
    totalEarned: Number(b.total_earned ?? b.totalEarned),
    totalWithdrawn: Number(b.total_withdrawn ?? b.totalWithdrawn),
    updatedAt: (b.updated_at ?? b.updatedAt) as string,
  }
}

export function mapSellerBalanceTransaction(tx: RawRow): SellerBalanceTransaction {
  return {
    id: tx.id as string,
    sellerBalanceId: (tx.seller_balance_id ?? tx.sellerBalanceId) as string,
    userId: (tx.user_id ?? tx.userId) as string,
    type: String(tx.type || ''),
    amount: Number(tx.amount || 0),
    description: (tx.description ?? tx.note) as string | undefined,
    referenceId: (tx.reference_id ?? tx.referenceId) as string | undefined,
    createdAt: (tx.created_at ?? tx.createdAt) as string,
  }
}

export function mapWithdrawal(w: RawRow): Withdrawal {
  return {
    id: w.id as string,
    sellerBalanceId: (w.seller_balance_id ?? w.sellerBalanceId) as string,
    userId: (w.user_id ?? w.userId) as string,
    amount: Number(w.amount),
    bankName: (w.bank_name ?? w.bankName) as string,
    accountNumber: (w.account_number ?? w.accountNumber) as string,
    accountName: (w.account_name ?? w.accountName) as string,
    status: w.status as Withdrawal['status'],
    processedAt: (w.processed_at ?? w.processedAt) as string | undefined,
    rejectedReason: (w.rejected_reason ?? w.rejectedReason) as string | undefined,
    adminNote: (w.admin_note ?? w.adminNote) as string | undefined,
    receiptUrl: (w.receipt_url ?? w.receiptUrl) as string | undefined,
    createdAt: (w.created_at ?? w.createdAt) as string,
    userName: (w.user_name ?? w.userName) as string | undefined,
    userEmail: (w.user_email ?? w.userEmail) as string | undefined,
  }
}

export function mapPromoCode(p: RawRow): PromoCode {
  let appliesTo = p.applies_to ?? p.appliesTo
  if (typeof appliesTo === 'string') {
    try {
      appliesTo = JSON.parse(appliesTo)
    } catch {
      appliesTo = undefined
    }
  }

  return {
    id: p.id as string,
    eventId: (p.event_id ?? p.eventId) as string,
    code: String(p.code || ''),
    description: p.description as string | undefined,
    discountType: (p.discount_type ?? p.discountType) as PromoCode['discountType'],
    discountValue: Number(p.discount_value ?? p.discountValue ?? 0),
    minPurchase: Number(p.min_purchase ?? p.minPurchase ?? 0),
    maxDiscount: p.max_discount !== undefined && p.max_discount !== null
      ? Number(p.max_discount)
      : (p.maxDiscount !== undefined && p.maxDiscount !== null ? Number(p.maxDiscount) : undefined),
    quota: p.quota !== undefined && p.quota !== null ? Number(p.quota) : undefined,
    usedCount: Number(p.used_count ?? p.usedCount ?? 0),
    maxPerUser: Number(p.max_per_user ?? p.maxPerUser ?? 1),
    appliesTo: Array.isArray(appliesTo) ? appliesTo.map(String) : undefined,
    startDate: (p.start_date ?? p.startDate) as string | undefined,
    endDate: (p.end_date ?? p.endDate) as string | undefined,
    isActive: Boolean(p.is_active ?? p.isActive),
    createdAt: (p.created_at ?? p.createdAt) as string | undefined,
  }
}

export function mapTicketPricingPhase(phase: RawRow): TicketPricingPhase {
  return {
    id: phase.id as string,
    ticketTypeId: (phase.ticket_type_id ?? phase.ticketTypeId) as string,
    phaseName: (phase.phase_name ?? phase.phaseName) as string,
    price: Number(phase.price || 0),
    quota: phase.quota !== undefined && phase.quota !== null ? Number(phase.quota) : undefined,
    quotaSold: Number(phase.quota_sold ?? phase.quotaSold ?? 0),
    startDate: (phase.start_date ?? phase.startDate) as string | undefined,
    endDate: (phase.end_date ?? phase.endDate) as string | undefined,
    sortOrder: Number(phase.sort_order ?? phase.sortOrder ?? 0),
    createdAt: (phase.created_at ?? phase.createdAt) as string | undefined,
  }
}
