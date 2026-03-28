import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Ticket, ShoppingBag, QrCode, Calendar, MapPin, Tag, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing, mapTicketPricingPhase } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR, formatDateRange } from '@/lib/utils'
import type { Ticket as TicketType, Order, Event, TicketType as TT, ResaleListing } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { UsernameSetupBanner } from '@/components/profile/UsernameSetupBanner'
import { SeatSocialBanner } from '@/components/social/SeatSocialBanner'

const MIDTRANS_CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY ?? ''

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
  const [open, setOpen] = useState(false)
  const safeCode = code || ''
  const short = safeCode.replace(/-/g, '').slice(0, 16)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(safeCode)}`
  const enlargeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(safeCode)}`

  return (
    <>
      <div 
        className="flex flex-col items-center justify-center shrink-0 w-24 gap-1.5 p-2 bg-muted/20 border-l border-border hover:bg-muted/40 transition-colors cursor-pointer group"
        onClick={() => setOpen(true)}
      >
        <div className="w-16 h-16 bg-white p-1 rounded border border-border group-hover:border-accent transition-colors">
          <img src={qrUrl} alt="QR Code" className="w-full h-full object-cover" />
        </div>
        <span className="text-[9px] font-mono text-muted-foreground text-center break-all leading-none">{short}</span>
        <button 
          onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          className="text-[10px] text-accent hover:underline font-medium"
        >
          Perbesar
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md flex flex-col items-center justify-center p-8 bg-background">
          <DialogTitle className="text-center font-bold text-lg mb-2 text-foreground">Scan E-Ticket</DialogTitle>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-border">
            <img src={enlargeUrl} alt="E-Ticket QR" className="w-64 h-64 object-contain" />
          </div>
          <p className="font-mono text-muted-foreground mt-4 text-xs text-center break-all px-4">{safeCode}</p>
          <a 
            href={enlargeUrl} 
            target="_blank" rel="noopener noreferrer"
            download={`Ticket-${short}.png`}
            onClick={(e) => e.stopPropagation()}
            className="mt-4 mb-4 text-sm text-accent hover:underline font-medium"
          >
            Unduh Gambar QR (HD)
          </a>
          <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
            Tutup
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface EnrichedTicket {
  ticket: TicketType
  ticketType: TT | null
  event: Event | null
  resaleListing: ResaleListing | null
  orderQty: number
  orderTotalPaid: number
  ticketSubtotalPaid: number
  orderItemCount: number
  pricingPhaseName: string | null
  usedPromo: boolean
  promoDiscount: number
}

export default function BuyerDashboardPage() {
  const { dbUser, refreshUser } = useAuth()
  const [tickets, setTickets] = useState<EnrichedTicket[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)

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

      const enriched = await Promise.all(
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

          const ticketSubtotalPaid = Number(
            matchedItem?.subtotal ?? (Number(ticketType?.price ?? 0) * Number(t.quantity || 1))
          )
          const orderTotalPaid = Number(order?.totalAmount ?? ticketSubtotalPaid)
          const promoDiscount = Number(order?.discountAmount ?? 0)
          const usedPromo = promoDiscount > 0 || Boolean(order?.promoCodeId)

          return {
            ticket: t,
            ticketType,
            event,
            resaleListing,
            orderQty: t.quantity,
            orderTotalPaid,
            ticketSubtotalPaid,
            orderItemCount: orderItems.length,
            pricingPhaseName,
            usedPromo,
            promoDiscount,
          }
        })
      )
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

  async function handleCancelResale(ticketId: string, listingId: string) {
    try {
      await api.delete(`/resale/listings/${listingId}`)
      toast.success('Listing resale dibatalkan.')
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
              {loadingTickets ? (
                <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border rounded-xl">
                  <Ticket className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold text-foreground mb-1">Belum ada tiket</p>
                  <p className="text-sm text-muted-foreground">Beli tiket event favoritmu!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.map((enriched) => (
                    <TicketCard
                      key={enriched.ticket.id}
                      enriched={enriched}
                      onCancelResale={() => {
                        if (enriched.resaleListing) {
                          handleCancelResale(enriched.ticket.id, enriched.resaleListing.id)
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="orders">
              {loadingOrders ? (
                <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border rounded-xl">
                  <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold text-foreground mb-1">Belum ada pesanan</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => <OrderRow key={order.id} order={order} reload={async () => { await loadOrders(); await loadTickets(); }} />)}
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
  } = enriched
  const displayPaidAmount = orderItemCount > 1 ? ticketSubtotalPaid : orderTotalPaid
  const isUsed = Number(ticket.isUsed) > 0
  const isListed = ticket.status === 'LISTED_FOR_RESALE'
  const [expanded, setExpanded] = useState(false)

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
              <StatusBadge status={isUsed ? 'USED' : ticket.status} />
            </div>
            <p className="text-xs text-muted-foreground">{ticketType?.name ?? 'Tiket'}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg w-fit">
              <span className="flex items-center gap-1.5"><Tag size={12} className="text-accent" /> <span className="font-bold text-foreground">{ticket.quantity} Tiket</span></span>
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
                    {orderItemCount > 1 && (
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

                  {ticket.status === 'ACTIVE' && !isUsed && event?.isResaleAllowed && (
                    <Link to="/dashboard/tickets/$ticketId/sell" params={{ ticketId: ticket.id }}>
                      <button
                        className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline transition-colors"
                      >
                        <Tag size={11} /> Jual Tiket
                      </button>
                    </Link>
                  )}

                  {ticket.status === 'ACTIVE' && !isUsed && event && (
                    <SeatSocialBanner
                      eventId={event.id}
                      ticketId={ticket.id}
                      eventName={event.title}
                    />
                  )}
                </div>

                <QRDisplay code={ticket.qrCode} />
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
