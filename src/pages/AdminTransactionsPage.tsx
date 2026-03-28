import { useEffect, useState } from 'react'
import { DollarSign, Clock, CheckCircle, ChevronDown, User as UserIcon, Tag, Calendar, MapPin } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapOrder, mapOrderItem, mapUser, mapEvent, mapTicketType } from '@/lib/mappers'
import { formatDate, formatIDR } from '@/lib/utils'
import type { Order, OrderItem, User, Event, TicketType } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'

type TabVal = 'all' | 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent ? 'bg-accent/10' : 'bg-muted'}`}>
          <Icon className={`w-3.5 h-3.5 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
        </div>
      </div>
      <p className="text-xl font-bold font-mono text-foreground">{value}</p>
    </div>
  )
}

interface EnrichedOrderItem {
  item: OrderItem
  event: Event | null
  ticketType: TicketType | null
}

function TransactionRow({ ord }: { ord: Order }) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<{ items: EnrichedOrderItem[]; user: User | null; loading: boolean }>({
    items: [],
    user: null,
    loading: false
  })

  useEffect(() => {
    if (expanded && details.items.length === 0 && !details.loading) {
      loadDetails()
    }
  }, [expanded])

  async function loadDetails() {
    setDetails(prev => ({ ...prev, loading: true }))
    try {
      const [rawItems, rawUser]: any = await Promise.all([
        api.get(`/order-items?order_id=${ord.id}`),
        api.get(`/users/${ord.userId}`)
      ])

      const items = (rawItems as any[]).map(mapOrderItem)
      const user = mapUser(rawUser)

      const enrichedItems = await Promise.all(items.map(async (item) => {
        let ticketType: TicketType | null = null
        let event: Event | null = null
        try {
          const rawTT: any = await api.get(`/ticket-types/${item.ticketTypeId}`)
          ticketType = mapTicketType(rawTT)
          if (ticketType) {
            const rawEv: any = await api.get(`/events/${ticketType.eventId}`)
            event = mapEvent(rawEv)
          }
        } catch {}
        return { item, event, ticketType }
      }))

      setDetails({ items: enrichedItems, user, loading: false })
    } catch {
      setDetails(prev => ({ ...prev, loading: false }))
    }
  }

  return (
    <>
      <tr 
        onClick={() => setExpanded(!expanded)}
        className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer group ${expanded ? 'bg-muted/20' : ''}`}
      >
        <td className="px-4 py-3 font-mono text-xs text-foreground">
          <div className="flex items-center gap-2">
            <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            {ord.id.toUpperCase()}
          </div>
        </td>
        <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={ord.status} /></td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{formatDate(ord.createdAt)}</td>
        <td className="px-4 py-3 text-right font-bold font-mono text-foreground text-xs">{formatIDR(Number(ord.totalAmount))}</td>
      </tr>
      {expanded && (
        <tr className="bg-muted/5 border-b border-border/50">
          <td colSpan={4} className="p-0">
            <div className="animate-in slide-in-from-top-2 duration-200 ease-out p-4 sm:px-12 sm:py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Purchaser Info */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <UserIcon size={12} /> Pembeli
                  </div>
                  {details.loading ? (
                    <Skeleton className="h-12 w-full rounded-lg" />
                  ) : details.user ? (
                    <div className="bg-background rounded-xl border border-border p-4 shadow-sm">
                      <p className="font-semibold text-foreground">{details.user.name || 'Hamba Allah'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{details.user.email}</p>
                      {details.user.phone && <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">📞 {details.user.phone}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Gagal memuat data pembeli.</p>
                  )}
                </div>

                {/* Status & Method */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <Clock size={12} /> Detail Pembayaran
                  </div>
                  <div className="bg-background rounded-xl border border-border p-4 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Status</span>
                      <StatusBadge status={ord.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Metode</span>
                      <span className="font-medium text-foreground">{ord.paymentMethod || '-'}</span>
                    </div>
                    {ord.paidAt && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Dibayar Pada</span>
                        <span className="font-medium text-emerald-600">{formatDate(ord.paidAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <Tag size={12} /> Rincian Item ({details.items.length})
                </div>
                {details.loading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                  </div>
                ) : details.items.length > 0 ? (
                  <div className="space-y-2">
                    {details.items.map(({ item, event, ticketType }) => (
                      <div key={item.id} className="bg-background rounded-xl border border-border p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground truncate">{event?.title || 'Event tidak ditemukan'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{ticketType?.name || 'Item'} — {item.quantity} Tiket</p>
                          
                          {/* Attendee Details (Manual Entry) */}
                          {item.attendeeDetails && Array.isArray(item.attendeeDetails) && item.attendeeDetails.length > 0 && (
                            <div className="mt-3 space-y-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Daftar Peserta</p>
                              {item.attendeeDetails.map((att: any, idx: number) => (
                                <div key={idx} className="text-xs flex flex-wrap gap-x-3 gap-y-0.5 border-b border-border/30 last:border-0 pb-1 mb-1 last:pb-0 last:mb-0">
                                  <span className="font-medium text-foreground">{att.name || 'Hamba Allah'}</span>
                                  <span className="text-muted-foreground">{att.email || '-'}</span>
                                  {att.phone && <span className="text-muted-foreground">📞 {att.phone}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {event && (
                            <div className="flex items-center gap-3 mt-3">
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Calendar size={10} /> {formatDate(event.startDate)}</span>
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin size={10} /> {event.location}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <p className="font-bold font-mono text-accent text-sm">{formatIDR(item.subtotal)}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">@ {formatIDR(item.unitPrice)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-4 bg-accent/5 rounded-xl border border-accent/20 border-dashed mt-4">
                      <p className="text-xs font-bold text-accent uppercase tracking-wider">Total Pembayaran</p>
                      <p className="text-lg font-bold font-mono text-accent">{formatIDR(ord.totalAmount)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Tidak ada item dalam pesanan ini.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function AdminTransactionsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabVal>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data: any = await api.get('/orders')
      setOrders(data.map(mapOrder))
    } finally {
      setLoading(false)
    }
  }

  const filtered = tab === 'all' ? orders : orders.filter((o) => o.status === tab)
  const totalRevenue = orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + Number(o.totalAmount), 0)
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length
  const paidCount = orders.filter((o) => o.status === 'PAID').length

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Semua Transaksi</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={DollarSign} label="Total Revenue" value={formatIDR(totalRevenue)} accent />
              <StatCard icon={CheckCircle} label="Transaksi Lunas" value={String(paidCount)} />
              <StatCard icon={Clock} label="Menunggu Pembayaran" value={String(pendingCount)} />
            </div>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabVal)}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">Semua ({orders.length})</TabsTrigger>
              <TabsTrigger value="PAID">Lunas ({paidCount})</TabsTrigger>
              <TabsTrigger value="PENDING">Pending ({pendingCount})</TabsTrigger>
              <TabsTrigger value="EXPIRED">Kadaluarsa ({orders.filter((o) => o.status === 'EXPIRED').length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab}>
              {loading ? (
                <div className="space-y-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <p className="text-sm text-muted-foreground">Tidak ada transaksi di filter ini.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Order ID</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Tanggal</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((ord) => (
                          <TransactionRow key={ord.id} ord={ord} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  )
}
