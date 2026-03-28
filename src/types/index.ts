// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'EO' | 'BUYER'

export type EOStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED'

export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED'

export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'LISTED_FOR_RESALE' | 'TRANSFERRED'

export type ResaleStatus = 'OPEN' | 'SOLD' | 'CANCELLED' | 'EXPIRED'

export type ResaleOrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED'

export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  isEmailVerified?: boolean
  name?: string
  image?: string
  phone?: string
  role: UserRole
  username?: string
  usernameChangedAt?: string
  isProfilePublic?: boolean
  bio?: string
  instagramHandle?: string
  createdAt: string
  updatedAt?: string
}

export interface EOProfile {
  id: string
  userId: string
  orgName: string
  description?: string
  phone?: string
  status: EOStatus
  createdAt: string
}

export interface Event {
  id: string
  eoProfileId: string
  title: string
  description: string
  category: string
  bannerImage?: string
  location: string
  locationUrl?: string
  startDate: string
  endDate: string
  status: EventStatus
  isResaleAllowed?: boolean
  createdAt: string
  updatedAt: string
}

export interface TicketType {
  id: string
  eventId: string
  name: string
  description?: string
  price: number
  effectivePrice?: number
  quota: number
  sold: number
  maxPerOrder: number
  maxPerAccount: number
  hasPricingPhases?: boolean
  isPriceUnavailable?: boolean
  activePhaseId?: string
  activePhaseName?: string
  activePhasePrice?: number
  activePhaseEndDate?: string
  activePhaseQuotaRemaining?: number | null
  saleStartDate: string
  saleEndDate: string
}

export interface Order {
  id: string
  userId: string
  totalAmount: number
  discountAmount?: number
  promoCodeId?: string
  promoCode?: string
  status: OrderStatus
  paymentMethod?: string
  paymentToken?: string
  paidAt?: string
  expiredAt: string
  createdAt: string
}

export interface PromoCode {
  id: string
  eventId: string
  code: string
  description?: string
  discountType: 'percentage' | 'flat'
  discountValue: number
  minPurchase: number
  maxDiscount?: number
  quota?: number
  usedCount: number
  maxPerUser: number
  appliesTo?: string[]
  startDate?: string
  endDate?: string
  isActive: boolean
  createdAt?: string
}

export interface TicketPricingPhase {
  id: string
  ticketTypeId: string
  phaseName: string
  price: number
  quota?: number
  quotaSold: number
  startDate?: string
  endDate?: string
  sortOrder: number
  createdAt?: string
}

export interface OrderItem {
  id: string
  orderId: string
  ticketTypeId: string
  quantity: number
  unitPrice: number
  subtotal: number
  activePhaseId?: string
  activePhaseName?: string
  attendeeDetails?: string | any[]
}

export interface Ticket {
  id: string
  orderId: string
  orderItemId?: string
  userId: string
  ticketTypeId: string
  qrCode: string
  status: TicketStatus
  isUsed: boolean
  usedAt?: string
  createdAt: string
  quantity: number
  attendeeDetails?: string | any[]
}

export interface ResaleListing {
  id: string
  ticketId: string
  sellerId: string
  originalPrice: number
  askingPrice: number
  maxAllowedPrice: number
  platformFee: number
  sellerReceives: number
  note?: string
  status: ResaleStatus
  listedAt: string
  soldAt?: string
  cancelledAt?: string
  expiredAt: string
  
  // Enriched fields for UI
  ticketTypeName?: string
  eventTitle?: string
  sellerUsername?: string
  sellerName?: string
  sellerAvatar?: string
}

export interface ResaleOrder {
  id: string
  resaleListingId: string
  buyerId: string
  totalPaid: number
  platformFee: number
  sellerReceives: number
  status: ResaleOrderStatus
  paymentToken?: string
  midtransOrderId?: string
  paymentMethod?: string
  paidAt?: string
  expiredAt: string
  createdAt: string
}

export interface SellerBalance {
  id: string
  userId: string
  balance: number
  totalEarned: number
  totalWithdrawn: number
  updatedAt: string
}

export interface Withdrawal {
  id: string
  sellerBalanceId: string
  userId: string
  amount: number
  bankName: string
  accountNumber: string
  accountName: string
  status: WithdrawalStatus
  processedAt?: string
  rejectedReason?: string
  adminNote?: string
  receiptUrl?: string
  createdAt: string
  
  // Enriched
  userName?: string
  userEmail?: string
}
