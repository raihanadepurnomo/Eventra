import { useState, useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Ticket, ShoppingBag, QrCode, Calendar, MapPin, Tag, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapOrder, mapOrderItem, mapTicket, mapResaleListing, mapTicketPricingPhase } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR, formatDateRange } from '@/lib/utils'
import type { Ticket as TicketType, Order, Event, TicketType as TT, ResaleListing } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { UsernameSetupBanner } from '@/components/profile/UsernameSetupBanner'
import { SeatSocialBanner } from '@/components/social/SeatSocialBanner'

const MIDTRANS_CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY ?? ''
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

declare global {
  interface Window {
    snap?: {
      pay: (token: string, options: {
        onSuccess: (result: unknown) => void
        onPending: (result: unknown) => void
        onError: (result: unknown) => void
        onClose: () => void
      }) => void
    }
  }
}

function QRDisplay({ code }: { code: string }) {
  return <QRDisplayMultiple codes={[code]} />
}

function QRDisplayMultiple({ codes }: { codes: string[] }) {
  const [open, setOpen] = useState(false)
  const uniqueCodes = Array.from(new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean)))

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0"
        onClick={() => setOpen(true)}
      >
        <QrCode size={13} className="mr-1" /> Lihat QR
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md p-5 bg-background">
          <DialogTitle className="text-center font-bold text-lg text-foreground">QR E-Ticket</DialogTitle>

          {uniqueCodes.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">QR tidak tersedia.</div>
          ) : (
            <div className="mt-3 max-h-[70vh] overflow-y-auto space-y-4 pr-1">
              {uniqueCodes.map((qrCode, idx) => {
                const short = qrCode.replace(/-/g, '').slice(0, 16)
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrCode)}`
                return (
                  <div key={`${qrCode}-${idx}`} className="rounded-xl border border-border bg-muted/10 p-3">
                    {uniqueCodes.length > 1 && (
                      <p className="text-xs font-semibold text-foreground mb-2">QR #{idx + 1}</p>
                    )}
                    <div className="bg-white p-3 rounded-lg border border-border flex items-center justify-center">
                      <img src={qrUrl} alt={`QR Ticket ${idx + 1}`} className="w-56 h-56 object-contain" />
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground mt-2 text-center break-all">{qrCode}</p>
                    <a
                      href={qrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={`Ticket-${short}.png`}
                      className="mt-2 block text-center text-xs text-accent hover:underline font-medium"
                    >
                      Unduh QR
                    </a>
                  </div>
                )
              })}
            </div>
          )}

          <Button variant="outline" className="w-full mt-3" onClick={() => setOpen(false)}>
            Tutup
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

function sanitizeFilename(name: string) {
  return String(name || 'ticket')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'ticket'
}

interface EnrichedTicket {
  groupId: string
  memberTicketIds: string[]
  resaleListingIds: string[]
  ticket: TicketType
  ticketType: TT | null
  event: Event | null
  resaleListing: ResaleListing | null
  qrCodes: string[]
  orderQty: number
  orderTotalPaid: number
  ticketSubtotalPaid: number
  orderItemCount: number
  pricingPhaseName: string | null
  usedPromo: boolean
  promoDiscount: number
}

function hasEventEnded(event: Event | null): boolean {
  if (!event?.endDate) return false
  const endTs = new Date(event.endDate).getTime()
  if (Number.isNaN(endTs)) return false
  return endTs < Date.now()
}

function getEffectiveTicketStatus(ticket: TicketType, event: Event | null): string {
  if (ticket.status === 'TRANSFERRED') return 'TRANSFERRED'
  if (ticket.status === 'LISTED_FOR_RESALE') return 'LISTED_FOR_RESALE'
  if (ticket.status === 'CANCELLED') return 'CANCELLED'
  if (ticket.status === 'USED' || Number(ticket.isUsed) > 0) return 'USED'
  if (ticket.status === 'ACTIVE' && hasEventEnded(event)) return 'EXPIRED'
  return ticket.status || 'ACTIVE'
}

function getTicketDisplayStatus(enriched: EnrichedTicket): string {
  return getEffectiveTicketStatus(enriched.ticket, enriched.event)
}

export default function BuyerDashboardPage() {
  const { dbUser, refreshUser } = useAuth()
  const [tickets, setTickets] = useState<EnrichedTicket[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketStatusFilter, setTicketStatusFilter] = useState('ALL')
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL')

  const filteredTickets = useMemo(() => {
    const q = ticketSearch.trim().toLowerCase()

    return tickets.filter((enriched) => {
      const status = getTicketDisplayStatus(enriched)
      if (ticketStatusFilter !== 'ALL' && status !== ticketStatusFilter) {
        return false
      }

      if (!q) return true

      const attendeeText = Array.isArray(enriched.ticket.attendeeDetails)
        ? (enriched.ticket.attendeeDetails as any[])
            .map((a) => `${a?.name || ''} ${a?.email || ''} ${a?.phone || ''}`.trim())
            .join(' ')
        : ''

      const haystack = [
        enriched.groupId,
        enriched.ticket.id,
        enriched.ticket.orderId,
        ...(enriched.memberTicketIds || []),
        enriched.event?.title,
        enriched.ticketType?.name,
        status,
        attendeeText,
        ...(enriched.qrCodes || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(q)
    })
  }, [tickets, ticketSearch, ticketStatusFilter])

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase()

    return orders.filter((order) => {
      if (orderStatusFilter !== 'ALL' && order.status !== orderStatusFilter) {
        return false
      }

      if (!q) return true

      const haystack = [
        order.id,
        order.status,
        order.paymentMethod,
        order.promoCode,
        String(order.totalAmount ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(q)
    })
  }, [orders, orderSearch, orderStatusFilter])

  // Load Snap script
  useEffect(() => {
    if (!MIDTRANS_CLIENT_KEY || window.snap) return
    const isProduction = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true'
    const script = document.createElement('script')
    script.src = isProduction ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js'
    script.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!dbUser) return
    loadTickets()
    loadOrders()
  }, [dbUser])

  async function loadTickets() {
    if (!dbUser) return
    setLoadingTickets(true)
    try {
      const rawTickets: any = await api.get(`/tickets?user_id=${dbUser.id}`)
      const ticketsMapped = rawTickets.map(mapTicket)

      const ttCache = new Map<string, TT | null>()
      const eventCache = new Map<string, Event | null>()
      const orderCache = new Map<string, Order | null>()
      const orderItemsCache = new Map<string, any[]>()
      const phaseNameCache = new Map<string, string | null>()

      const enrichedDraft = await Promise.all(
        ticketsMapped.map(async (t: TicketType) => {
          let ticketType: TT | null = null
          let event: Event | null = null
          let resaleListing: ResaleListing | null = null
          let order: Order | null = null
          let orderItems: any[] = []
          let matchedItem: any = null
          let pricingPhaseName: string | null = null

          try {
            if (ttCache.has(t.ticketTypeId)) {
              ticketType = ttCache.get(t.ticketTypeId) || null
            } else {
              const rawTT: any = await api.get(`/ticket-types/${t.ticketTypeId}`)
              ticketType = mapTicketType(rawTT)
              ttCache.set(t.ticketTypeId, ticketType)
            }

            if (ticketType) {
              if (eventCache.has(ticketType.eventId)) {
                event = eventCache.get(ticketType.eventId) || null
              } else {
                const rawEv: any = await api.get(`/events/${ticketType.eventId}`)
                event = mapEvent(rawEv)
                eventCache.set(ticketType.eventId, event)
              }
            }

            if (orderCache.has(t.orderId)) {
              order = orderCache.get(t.orderId) || null
            } else {
              const rawOrder: any = await api.get(`/orders/${t.orderId}`)
              order = rawOrder ? mapOrder(rawOrder) : null
              orderCache.set(t.orderId, order)
            }

            if (orderItemsCache.has(t.orderId)) {
              orderItems = orderItemsCache.get(t.orderId) || []
            } else {
              const rawItems: any = await api.get(`/order-items?order_id=${t.orderId}`)
              orderItems = Array.isArray(rawItems) ? rawItems.map(mapOrderItem) : []
              orderItemsCache.set(t.orderId, orderItems)
            }

            matchedItem = t.orderItemId
              ? orderItems.find((item) => item.id === t.orderItemId)
              : orderItems.find((item) => item.ticketTypeId === t.ticketTypeId)

            const activePhaseId = matchedItem?.activePhaseId
            if (activePhaseId) {
              if (phaseNameCache.has(activePhaseId)) {
                pricingPhaseName = phaseNameCache.get(activePhaseId) || null
              } else {
                const rawPhases: any = await api.get(`/ticket-pricing-phases?ticket_type_id=${t.ticketTypeId}`)
                const phases = Array.isArray(rawPhases) ? rawPhases.map(mapTicketPricingPhase) : []
                const phase = phases.find((p) => p.id === activePhaseId)
                pricingPhaseName = phase?.phaseName || null
                phaseNameCache.set(activePhaseId, pricingPhaseName)
              }
            }

            if (t.status === 'LISTED_FOR_RESALE') {
              const listings = await api.get(`/resale-listings?ticket_id=${t.id}&status=${'OPEN'}`)
              resaleListing = (listings as ResaleListing[])[0] ?? null
            }
          } catch { /* ignore */ }

          const matchedItemQty = Math.max(1, Number(matchedItem?.quantity || 1))
          const matchedItemSubtotal = Number(matchedItem?.subtotal || 0)
          const defaultSubtotal = Number(ticketType?.price ?? 0) * Number(t.quantity || 1)
          const perTicketSubtotal = matchedItemSubtotal > 0
            ? (matchedItemSubtotal / matchedItemQty) * Math.max(1, Number(t.bundleTotal || 1) > 1 ? 1 : Number(t.quantity || 1))
            : defaultSubtotal

          const ticketSubtotalPaid = Number(perTicketSubtotal)
          const orderTotalPaid = Number(order?.totalAmount ?? ticketSubtotalPaid)
          const promoDiscount = Number(order?.discountAmount ?? 0)
          const usedPromo = promoDiscount > 0 || Boolean(order?.promoCodeId)
          const effectiveStatus = getEffectiveTicketStatus(t, event)
          const groupBaseKey = t.orderItemId || `${t.orderId}:${t.ticketTypeId}`
          const ownQrCode = String(t.qrCode || '').trim()

          return {
            ticket: t,
            ticketType,
            event,
            resaleListing,
            qrCodes: ownQrCode ? [ownQrCode] : [],
            orderQty: t.quantity,
            orderTotalPaid,
            ticketSubtotalPaid,
            orderItemCount: orderItems.length,
            pricingPhaseName,
            usedPromo,
            promoDiscount,
            _groupBaseKey: groupBaseKey,
            _effectiveStatus: effectiveStatus,
            _ownQrCode: ownQrCode,
          }
        })
      )

      const groupedMap = new Map<string, any>()

      for (const row of enrichedDraft as any[]) {
        const groupId = `${row._groupBaseKey}:${row._effectiveStatus}`
        const attendeeRows = Array.isArray(row.ticket.attendeeDetails) ? row.ticket.attendeeDetails : []
        const ownCode = String(row._ownQrCode || '').trim()
        const ownListingId = row.resaleListing?.id ? String(row.resaleListing.id) : ''

        if (!groupedMap.has(groupId)) {
          groupedMap.set(groupId, {
            ...row,
            groupId,
            memberTicketIds: [String(row.ticket.id)],
            resaleListingIds: ownListingId ? [ownListingId] : [],
            qrCodes: ownCode ? [ownCode] : [],
            ticket: {
              ...row.ticket,
              quantity: Number(row.ticket.quantity || 1),
              attendeeDetails: [...attendeeRows],
            },
          })
          continue
        }

        const grouped = groupedMap.get(groupId)

        grouped.memberTicketIds.push(String(row.ticket.id))
        grouped.qrCodes = Array.from(new Set([...(grouped.qrCodes || []), ...(ownCode ? [ownCode] : [])]))

        if (ownListingId && !grouped.resaleListingIds.includes(ownListingId)) {
          grouped.resaleListingIds.push(ownListingId)
        }

        grouped.ticket.quantity = Number(grouped.ticket.quantity || 0) + Number(row.ticket.quantity || 1)
        grouped.ticket.attendeeDetails = [
          ...(Array.isArray(grouped.ticket.attendeeDetails) ? grouped.ticket.attendeeDetails : []),
          ...attendeeRows,
        ]

        grouped.orderQty = Number(grouped.orderQty || 0) + Number(row.orderQty || 0)
        grouped.ticketSubtotalPaid = Number(grouped.ticketSubtotalPaid || 0) + Number(row.ticketSubtotalPaid || 0)
        grouped.orderTotalPaid = Math.max(Number(grouped.orderTotalPaid || 0), Number(row.orderTotalPaid || 0))
        grouped.orderItemCount = Math.max(Number(grouped.orderItemCount || 0), Number(row.orderItemCount || 0))
        grouped.usedPromo = Boolean(grouped.usedPromo || row.usedPromo)
        grouped.promoDiscount = Math.max(Number(grouped.promoDiscount || 0), Number(row.promoDiscount || 0))

        if (!grouped.resaleListing && row.resaleListing) {
          grouped.resaleListing = row.resaleListing
        }
      }

      const enriched = Array.from(groupedMap.values())
        .map((row: any) => {
          const { _groupBaseKey, _effectiveStatus, _ownQrCode, ...clean } = row
          return clean
        })
        .sort((a: any, b: any) => {
          const aTs = new Date(String(a.ticket?.createdAt || 0)).getTime()
          const bTs = new Date(String(b.ticket?.createdAt || 0)).getTime()
          return bTs - aTs
        })
      setTickets(enriched)
    } finally {
      setLoadingTickets(false)
    }
  }

  async function loadOrders() {
    if (!dbUser) return
    setLoadingOrders(true)
    try {
      const [regOrders, resOrders]: [any, any] = await Promise.all([
        api.get(`/orders?user_id=${dbUser.id}`),
        api.get(`/resale/orders?buyer_id=${dbUser.id}`)
      ])
      const combined = [
        ...regOrders.map(mapOrder),
        ...resOrders.map((o: any) => mapOrder({ ...o, user_id: o.buyer_id, total_amount: o.total_paid }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      
      setOrders(combined)
    } finally {
      setLoadingOrders(false)
    }
  }

  async function handleCancelResale(listingIds: string[]) {
    const ids = Array.from(new Set((listingIds || []).filter(Boolean)))
    if (!ids.length) return

    try {
      const results = await Promise.allSettled(ids.map((id) => api.delete(`/resale/listings/${id}`)))
      const successCount = results.filter((r) => r.status === 'fulfilled').length

      if (successCount <= 0) {
        toast.error('Gagal membatalkan listing.')
        return
      }

      if (successCount < ids.length) {
        toast.success(`${successCount} listing berhasil dibatalkan, sebagian gagal.`)
      } else {
        toast.success('Listing resale dibatalkan.')
      }

      await loadTickets()
    } catch {
      toast.error('Gagal membatalkan listing.')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-14">
        <div className="border-b border-border bg-secondary/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
            <h1 className="text-2xl font-bold text-foreground">Dashboard Saya</h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola tiket dan riwayat pesanan Anda</p>

          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <UsernameSetupBanner />
          <Tabs defaultValue="tickets">
            <TabsList className="mb-6">
              <TabsTrigger value="tickets" className="gap-1.5"><Ticket size={14} /> Tiket Saya</TabsTrigger>
              <TabsTrigger value="orders" className="gap-1.5"><ShoppingBag size={14} /> Pesanan</TabsTrigger>
            </TabsList>

            <TabsContent value="tickets">
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  placeholder="Cari tiket, event, order, QR, peserta"
                  className="sm:col-span-2"
                />
                <select
                  value={ticketStatusFilter}
                  onChange={(e) => setTicketStatusFilter(e.target.value)}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="ALL">Semua Status Tiket</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="EXPIRED">Expired (Tidak Check-in)</option>
                  <option value="LISTED_FOR_RESALE">Dijual</option>
                  <option value="USED">Digunakan</option>
                  <option value="TRANSFERRED">Telah Terjual</option>
                  <option value="CANCELLED">Dibatalkan</option>
                </select>
              </div>

              {loadingTickets ? (
                <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
              ) : filteredTickets.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border rounded-xl">
                  <Ticket className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold text-foreground mb-1">Tiket tidak ditemukan</p>
                  <p className="text-sm text-muted-foreground">Coba ubah kata kunci pencarian atau filter status.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map((enriched) => (
                    <TicketCard
                      key={enriched.groupId}
                      enriched={enriched}
                      onCancelResale={() => {
                        if (enriched.resaleListingIds.length > 0) {
                          handleCancelResale(enriched.resaleListingIds)
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="orders">
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Cari ID order, metode, status"
                  className="sm:col-span-2"
                />
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="ALL">Semua Status Transaksi</option>
                  <option value="PENDING">Menunggu</option>
                  <option value="PAID">Lunas</option>
                  <option value="CANCELLED">Dibatalkan</option>
                  <option value="EXPIRED">Kedaluwarsa</option>
                  <option value="REFUNDED">Dikembalikan</option>
                </select>
              </div>

              {loadingOrders ? (
                <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border rounded-xl">
                  <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold text-foreground mb-1">Transaksi tidak ditemukan</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.map((order) => <OrderRow key={order.id} order={order} reload={async () => { await loadOrders(); await loadTickets(); }} />)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />

      {/* Old Resale Dialog Removed */}
    </div>
  )
}

function TicketCard({ enriched, onCancelResale }: {
  enriched: EnrichedTicket
  onCancelResale: () => void
}) {
  const {
    ticket,
    ticketType,
    event,
    resaleListing,
    orderQty,
    orderTotalPaid,
    ticketSubtotalPaid,
    orderItemCount,
    pricingPhaseName,
    usedPromo,
    promoDiscount,
    qrCodes,
  } = enriched
  const displayPaidAmount = ticketSubtotalPaid
  const isUsed = Number(ticket.isUsed) > 0
  const isListed = ticket.status === 'LISTED_FOR_RESALE'
  const isResalePurchasedTicket = String(ticket.orderId || '').startsWith('rord_')
  const ticketStatusForBadge = getEffectiveTicketStatus(ticket, event)
  const bundleIndex = Number(ticket.bundleIndex || 1)
  const bundleTotal = Number(ticket.bundleTotal || 1)
  const isBundleTicket = bundleTotal > 1 || Boolean(ticketType?.isBundle)
  const [expanded, setExpanded] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  async function handleDownloadTicketPdf() {
    setDownloadingPdf(true)
    try {
      const token = localStorage.getItem('eventra_token')
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {}

      const response = await fetch(
        `${API_BASE_URL}/tickets/order/${encodeURIComponent(ticket.orderId)}/pdf?status=${encodeURIComponent(ticketStatusForBadge)}`,
        {
          method: 'GET',
          headers,
        }
      )

      if (!response.ok) {
        let message = 'Gagal mengunduh PDF tiket.'
        try {
          const errData = await response.json()
          message = errData?.error || message
        } catch {
          // ignore non-json error body
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)

      const disposition = response.headers.get('content-disposition') || ''
      const matched = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
      const fallbackName = `tickets-${sanitizeFilename(event?.title || ticket.orderId)}-${sanitizeFilename(ticket.orderId)}.pdf`
      const rawFileName = matched?.[1] || matched?.[2] || fallbackName
      const fileName = decodeURIComponent(String(rawFileName).replace(/['"]/g, ''))

      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)

      toast.success('PDF tiket berhasil diunduh.')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengunduh PDF tiket.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div className="flex items-stretch rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-2 shrink-0 ${isListed ? 'bg-amber-500' : 'bg-accent'}`} />
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold text-foreground truncate">
                {event?.title ?? 'Event tidak ditemukan'}
              </p>
              <StatusBadge status={ticketStatusForBadge} />
            </div>
            <p className="text-xs text-muted-foreground">{ticketType?.name ?? 'Tiket'}</p>
            {isBundleTicket && (
              <p className="text-[11px] text-emerald-700 mt-1">{ticketType?.name || 'Paket'} — Paket {bundleIndex} dari {bundleTotal}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg w-fit">
              <span className="flex items-center gap-1.5"><Tag size={12} className="text-accent" /> <span className="font-bold text-foreground">{isBundleTicket ? `${ticket.quantity} Orang` : `${ticket.quantity} Tiket`}</span></span>
              <span className="w-px h-3 bg-border" />
              <span>Total Dibayar: <span className="font-mono font-bold text-foreground">{formatIDR(displayPaidAmount)}</span></span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp size={13} className="mr-1" /> : <ChevronDown size={13} className="mr-1" />}
            {expanded ? 'Sembunyikan' : 'Lihat Detail'}
          </Button>
        </div>

        <div
          className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <div className="pt-4 border-t border-border">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  {event && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar size={11} /><span>{formatDateRange(event.startDate, event.endDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin size={11} /><span className="truncate">{event.location}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
                      Harga tiket: <span className="font-semibold text-foreground">{pricingPhaseName || 'Regular'}</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
                      Voucher promo: <span className="font-semibold text-foreground">{usedPromo ? 'Ya' : 'Tidak'}</span>
                    </span>
                    {promoDiscount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        Diskon order: -{formatIDR(promoDiscount)}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
                      Subtotal tiket ini: <span className="font-semibold text-foreground">{formatIDR(ticketSubtotalPaid)}</span>
                    </span>
                    {(orderItemCount > 1 || orderTotalPaid > ticketSubtotalPaid) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
                        Total order: <span className="font-semibold text-foreground">{formatIDR(orderTotalPaid)}</span>
                      </span>
                    )}
                  </div>

                  {ticket.quantity > 1 && ticket.attendeeDetails && Array.isArray(ticket.attendeeDetails) && (
                    <div className="mt-3 space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Daftar Peserta:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(ticket.attendeeDetails as any[]).map((a, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded border border-border">
                            {a.name || 'Peserta'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {isListed && resaleListing && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        Dijual: {formatIDR(Number(resaleListing.askingPrice))}
                      </span>
                      <button
                        onClick={onCancelResale}
                        className="text-xs text-muted-foreground hover:text-destructive hover:font-bold transition-all underline decoration-dotted underline-offset-4"
                      >
                        Batalkan
                      </button>
                    </div>
                  )}

                  {ticketStatusForBadge === 'ACTIVE' && event?.isResaleAllowed && !isBundleTicket && !isResalePurchasedTicket && (
                    <Link to="/dashboard/tickets/$ticketId/sell" params={{ ticketId: ticket.id }}>
                      <button
                        className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline transition-colors"
                      >
                        <Tag size={11} /> Jual Tiket
                      </button>
                    </Link>
                  )}

                  <button
                    type="button"
                    className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline transition-colors"
                    onClick={handleDownloadTicketPdf}
                    disabled={downloadingPdf}
                  >
                    <Download size={11} /> {downloadingPdf ? 'Membuat PDF...' : 'Download PDF Tiket Status Ini'}
                  </button>

                  {ticketStatusForBadge === 'ACTIVE' && event && (
                    <SeatSocialBanner
                      eventId={event.id}
                      ticketId={ticket.id}
                      eventName={event.title}
                    />
                  )}
                </div>

                <QRDisplayMultiple codes={qrCodes.length > 0 ? qrCodes : [ticket.qrCode]} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderRow({ order, reload }: { order: Order; reload: () => Promise<void> }) {
  const [checking, setChecking] = useState(false)
  const [items, setItems] = useState<{ ticketTypeName: string; eventTitle: string; qty: number; unitPrice: number; subtotal: number; pricingLabel: string; isEarlyBird: boolean }[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // Auto sync on mount if pending
  useEffect(() => {
    if (order.status === 'PENDING') {
      handleCheckStatus(true)
    }
    loadItems()
  }, [])

  async function loadItems() {
    setLoadingItems(true)
    try {
      if (order.id.startsWith('rord_')) {
        // Resale order only has one item
        const resOrderRaw: any = await api.get(`/resale/orders/${order.id}`)
        const listing = resOrderRaw.listing
        if (listing) {
          setItems([{
            ticketTypeName: listing.ticket_type_name || 'Resale Ticket',
            eventTitle: listing.event_title || 'Event Resale',
            qty: 1,
            unitPrice: Number(order.totalAmount),
            subtotal: Number(order.totalAmount),
            pricingLabel: 'Resale',
            isEarlyBird: false,
          }])
        }
      } else {
        const rawItems: any = await api.get(`/order-items?order_id=${order.id}`)
        const mapped = rawItems.map(mapOrderItem)
        const enriched = await Promise.all(
          mapped.map(async (item: any) => {
            let ticketTypeName = 'Tiket'
            let eventTitle = '-'
            try {
              const rawTT: any = await api.get(`/ticket-types/${item.ticketTypeId}`)
              const tt = mapTicketType(rawTT)
              ticketTypeName = tt.name
              const rawEv: any = await api.get(`/events/${tt.eventId}`)
              const ev = mapEvent(rawEv)
              eventTitle = ev.title
            } catch {}
            const pricingLabel = item.activePhaseName || 'Regular'
            return {
              ticketTypeName,
              eventTitle,
              qty: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
              pricingLabel,
              isEarlyBird: /early\s*bird/i.test(pricingLabel),
            }
          })
        )
        setItems(enriched)
      }
    } catch {} finally {
      setLoadingItems(false)
    }
  }

  async function handleCheckStatus(silent = false) {
    if (!silent) setChecking(true)
    try {
      const authToken = await localStorage.getItem('eventra_token')
      const res = await fetch(`http://localhost:5000/api/payment/check/${order.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status !== order.status) {
          if (!silent) toast.success('Status transaksi otomatis diperbarui!')
          await reload()
        } else if (!silent) {
          toast.success('Status sinkronisasi selesai, tidak ada perubahan.')
        }
      } else if (!silent) {
        toast.error('Gagal sinkronisasi pembayaran.')
      }
    } catch {
      if (!silent) toast.error('Network Error.')
    } finally {
      if (!silent) setChecking(false)
    }
  }

  async function handlePay() {
    if (!order.paymentToken && !MIDTRANS_CLIENT_KEY) { toast.error('Token Midtrans tidak tersedia'); return }
    
    if (order.paymentToken && window.snap) {
      window.snap.pay(order.paymentToken, {
        onSuccess: handleCheckStatus,
        onPending: handleCheckStatus,
        onError: handleCheckStatus,
        onClose: handleCheckStatus
      })
    } else {
      try {
        const authToken = await localStorage.getItem('eventra_token')
        const res = await fetch('http://localhost:5000/api/payment/create', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
           body: JSON.stringify({ orderId: order.id }),
        })
        const data = await res.json()
        if (data.token && window.snap) {
           window.snap.pay(data.token, {
             onSuccess: handleCheckStatus,
             onPending: handleCheckStatus,
             onError: handleCheckStatus,
             onClose: handleCheckStatus
           })
        }
      } catch {
        toast.error('Gagal membuat transaksi midtrans.')
      }
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs font-mono text-muted-foreground">Order #{order.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          <p className="text-sm font-bold font-mono text-foreground">{formatIDR(Number(order.totalAmount))}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp size={13} className="mr-1" /> : <ChevronDown size={13} className="mr-1" />}
            {expanded ? 'Sembunyikan' : 'Lihat Detail'}
          </Button>
        </div>
      </div>

      {/* Items detail */}
      <div className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="p-4">
            {loadingItems ? (
              <div className="text-xs text-muted-foreground">Memuat rincian...</div>
            ) : items.length === 0 ? (
              <div className="text-xs text-muted-foreground">Tidak ada rincian item.</div>
            ) : (
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{item.eventTitle}</p>
                      <p className="text-xs text-muted-foreground">{item.ticketTypeName} × {item.qty}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
                          Harga: <span className="font-semibold text-foreground">{item.pricingLabel}</span>
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${item.isEarlyBird ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-background text-muted-foreground'}`}>
                          Early Bird: <span className="font-semibold">{item.isEarlyBird ? 'Ya' : 'Tidak'}</span>
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="font-mono text-sm font-medium text-foreground">{formatIDR(item.subtotal)}</p>
                      <p className="text-xs text-muted-foreground">@ {formatIDR(item.unitPrice)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!order.id.startsWith('rord_') && (
              <div className={`mt-3 rounded-lg border p-2.5 text-xs ${Number(order.discountAmount || 0) > 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-muted/20'}`}>
                {Number(order.discountAmount || 0) > 0 ? (
                  <div className="space-y-1 text-emerald-700">
                    <p>
                      Kode Voucher Promo: <span className="font-semibold">{order.promoCode || '-'}</span>
                    </p>
                    <p>
                      Potongan Promo: <span className="font-semibold">- {formatIDR(Number(order.discountAmount || 0))}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Kode Voucher Promo: <span className="font-semibold text-foreground">Tidak digunakan</span>
                  </p>
                )}
              </div>
            )}

            {order.paidAt && (
              <p className="text-xs text-emerald-600 mt-3">Dibayar pada: {formatDate(order.paidAt)}</p>
            )}

            {order.status === 'PENDING' && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={handlePay} className="bg-accent text-accent-foreground flex-1 sm:flex-none">Bayar</Button>
                <Button size="sm" variant="outline" onClick={() => handleCheckStatus(false)} disabled={checking} className="flex-1 shrink-0 sm:flex-none">
                  {checking ? 'Mengecek...' : 'Sinkronkan Midtrans'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
