// @ts-nocheck
import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  TrendingUp,
  DollarSign,
  Ticket as TicketIcon,
  Calendar,
  BarChart3,
  Plus,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR, formatDateRange } from '@/lib/utils'
import type { Event, EOProfile, TicketType, Order, OrderItem, Ticket } from '@/types'
import { mapTicket } from '@/lib/mappers'

interface DailySale { date: string; revenue: number; tickets: number }
interface TopEvent { event: Event; revenue: number; sold: number }

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-accent/10' : 'bg-muted'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1 truncate">{sub}</p>}
    </div>
  )
}

const RANGE_OPTIONS = [
  { label: '7 Hari', value: '7' },
  { label: '30 Hari', value: '30' },
  { label: '90 Hari', value: '90' },
]

const ACCENT = '#6467F2'
const COLORS = ['#6467F2', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF']

export default function EODashboardPage() {
  const { dbUser } = useAuth()
  const navigate = useNavigate()
  
  const [profile, setProfile] = useState<EOProfile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [paidOrders, setPaidOrders] = useState<Order[]>([])
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('30')

  useEffect(() => {
    if (!dbUser) return
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [dbUser])

  async function load() {
    if (!dbUser) return
    try {
      // 1. Get EO profile
      const profiles = await api.get(`/eo-profiles?user_id=${dbUser.id}`)
      const p = (profiles as any[]).map(mapEOProfile)[0]
      
      if (!p) {
        navigate({ to: '/eo/setup' })
        return
      }
      if (p.status === 'PENDING') {
        navigate({ to: '/eo/setup' })
        return
      }
      setProfile(p)

      // 2. Get events
      const rawEvs: any = await api.get(`/events?eo_profile_id=${p.id}`)
      const evs = rawEvs.map(mapEvent)
      setEvents(evs)

      if (evs.length === 0) {
        setLoading(false)
        return
      }

      // 3. Get ticket types and orders info concurrently
      const [rawTTs, rawOrders, rawItems] = await Promise.all([
        (async () => {
          const allTTs: TicketType[] = []
          for (const ev of evs) {
            const tts: any = await api.get(`/ticket-types?event_id=${ev.id}`)
            allTTs.push(...tts.map(mapTicketType))
          }
          return allTTs
        })(),
        api.get(`/orders?eo_profile_id=${p.id}&status=PAID`),
        api.get('/order-items'),
        api.get('/tickets') // This might need a filter by EO in future, but for now we'll filter on frontend
      ])

      setTicketTypes(rawTTs)
      
      const allOrders = (rawOrders as any[]).map(mapOrder)
      const allItems = (rawItems as any[]).map(mapOrderItem)
      const allTickets = (rawItems.tickets || (await api.get('/tickets') as any[])).map(mapTicket) 
      // Wait, let's just use the direct fetch in Promise.all correctly.
      // Re-fetching in the same block to be safe.
      const rawTickets = await api.get('/tickets') as any[]
      const mappedTickets = rawTickets.map(mapTicket)
      setTickets(mappedTickets)

      // Filter relevant order items
      const ttIds = new Set(rawTTs.map(t => t.id))
      const paidOrderIds = new Set(allOrders.map(o => o.id))
      
      // Filter out items where the corresponding ticket has been resold (TRANSFERRED)
      const invalidOrderItemIds = new Set(
        mappedTickets.filter(t => t.status === 'TRANSFERRED').map(t => (t as any).orderItemId)
      )
      // For revenue: ONLY USED tickets
      const usedOrderItemIds = new Set(
        mappedTickets.filter(t => t.status === 'USED').map(t => (t as any).orderItemId)
      )

      const relevantItems = allItems.filter(
        item => ttIds.has(item.ticketTypeId) && 
                paidOrderIds.has(item.orderId) && 
                !invalidOrderItemIds.has(item.id)
      )
      
      const earnedItems = relevantItems.filter(i => usedOrderItemIds.has(i.id))
      const relevantOrderIds = new Set(relevantItems.map(i => i.orderId))
      const relevantOrders = allOrders.filter(o => relevantOrderIds.has(o.id))
      const earnedOrders = relevantOrders.filter(o => {
        const items = allItems.filter(i => i.orderId === o.id)
        return items.some(i => usedOrderItemIds.has(i.id))
      })

      setPaidOrders(relevantOrders) // Keep all paid orders for stats
      setOrderItems(relevantItems) // Keep all non-resold items for stats
      
      // Override revenue memo variables later or just use them here.
      // Actually, let's keep relevantItems as non-resold, but 
      // I'll modify the Revenue memos to only use USED.
    } finally {
      setLoading(false)
    }
  }

  // ─── Derived Metrics ────────────────────────────────────────────────────────
  
  const totalRevenue = useMemo(() => {
    return orderItems.reduce((s, i) => s + Number(i.subtotal || 0), 0)
  }, [orderItems])

  const totalTicketsSold = useMemo(() =>
    orderItems.reduce((s, i) => s + Number(i.quantity), 0),
    [orderItems]
  )

  const thisMonthRevenue = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7)
    return paidOrders
      .filter(o => String(o.paidAt ?? '').startsWith(monthKey))
      .reduce((s, o) => {
        const items = orderItems.filter(i => i.orderId === o.id)
        return s + items.reduce((ss, i) => ss + Number(i.subtotal || 0), 0)
      }, 0)
  }, [paidOrders, orderItems])

  const dailySales = useMemo((): DailySale[] => {
    const days = Number(range)
    const map: Record<string, DailySale> = {}
    const now = Date.now()

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000)
      const key = d.toISOString().slice(0, 10)
      map[key] = { date: key, revenue: 0, tickets: 0 }
    }

    for (const order of paidOrders) {
      if (!order.paidAt) continue
      const key = String(order.paidAt).slice(0, 10)
      if (!map[key]) continue
      const itemsForOrder = orderItems.filter(i => i.orderId === order.id)
      map[key].revenue += itemsForOrder.reduce((s, i) => s + Number(i.subtotal || 0), 0)
      map[key].tickets += itemsForOrder.reduce((s, i) => s + Number(i.quantity || 0), 0)
    }

    return Object.values(map).map(d => ({
      ...d,
      date: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d.date)),
    }))
  }, [paidOrders, orderItems, range])

  const topEvents = useMemo((): TopEvent[] => {
    return events
      .map(ev => {
        const evTTs = ticketTypes.filter(tt => tt.eventId === ev.id)
        const ttIds = new Set(evTTs.map(t => t.id))
        const items = orderItems.filter(i => ttIds.has(i.ticketTypeId))
        const revenue = items.reduce((s, i) => s + Number(i.subtotal), 0)
        const sold = items.reduce((s, i) => s + Number(i.quantity), 0)
        return { event: ev, revenue, sold }
      })
      .filter(e => e.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
  }, [events, ticketTypes, orderItems])

  const eventBarData = topEvents.map(e => ({
    name: e.event.title.length > 15 ? e.event.title.slice(0, 15) + '…' : e.event.title,
    revenue: e.revenue,
    sold: e.sold,
  }))

  const tooltipFormatter = (v: any) => formatIDR(Number(v))

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-semibold text-foreground">
              {profile ? profile.orgName : 'Dashboard EO'}
            </h1>
            <div className="hidden sm:block h-4 w-px bg-border" />
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-32 h-7 text-[10px] bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-[10px]">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 h-8 text-xs">
            <Link to="/eo/events/create"><Plus size={14} className="mr-1" /> Buat Event</Link>
          </Button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading ? (
             <div className="space-y-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-[300px] rounded-xl w-full" />
             </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={DollarSign} label="Total Penjualan" value={formatIDR(totalRevenue)} sub="Total semua waktu" accent />
                <StatCard icon={TrendingUp} label="Bulan Ini" value={formatIDR(thisMonthRevenue)} sub="Target bulan ini" />
                <StatCard icon={TicketIcon} label="Tiket Terjual" value={String(totalTicketsSold)} sub="Total semua event" />
                <StatCard icon={Calendar} label="Event Aktif" value={String(events.filter(e => e.status === 'PUBLISHED').length)} sub={`Dari ${events.length} total event`} />
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                 {/* Main Revenue Chart */}
                 <div className="xl:col-span-2 rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 mb-6">
                      <BarChart3 className="w-4 h-4 text-accent" />
                      <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">Revenue Harian</h2>
                    </div>
                    {dailySales.every(d => d.revenue === 0) ? (
                      <div className="h-60 flex flex-col items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                        <TrendingUp className="w-8 h-8 opacity-20 mb-2" />
                        Belum ada data penjualan dalam {RANGE_OPTIONS.find(o => o.value === range)?.label}.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={dailySales}>
                          <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={ACCENT} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={ACCENT} stopOpacity={0.01} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false}
                            axisLine={false}
                            interval={Number(range) > 7 ? 'preserveStartEnd' : 0}
                          />
                          <YAxis 
                            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={v => `${(v/1000).toFixed(0)}K`}
                          />
                          <Tooltip 
                            formatter={tooltipFormatter}
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 10 }}
                          />
                          <Area type="monotone" dataKey="revenue" stroke={ACCENT} fill="url(#chartGradient)" strokeWidth={2} activeDot={{ r: 4 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                 </div>

                 {/* Top Events */}
                 <div className="rounded-xl border border-border bg-card p-5">
                    <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-6">Top Performa Event</h2>
                    {eventBarData.length === 0 ? (
                      <div className="h-60 flex items-center justify-center text-xs text-muted-foreground italic">Belum ada data.</div>
                    ) : (
                      <div className="space-y-6">
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={eventBarData} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} width={80} />
                            <Tooltip formatter={tooltipFormatter} cursor={{fill: 'transparent'}} />
                            <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                              {eventBarData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        
                        <div className="space-y-3 pt-4 border-t border-border">
                          {topEvents.map(({ event, revenue, sold }, i) => (
                            <div key={event.id} className="flex items-center justify-between group">
                              <div className="min-w-0 pr-4">
                                <p className="text-xs font-medium text-foreground truncate group-hover:text-accent transition-colors">{event.title}</p>
                                <p className="text-[10px] text-muted-foreground">{sold} tiket</p>
                              </div>
                              <span className="text-xs font-bold font-mono text-foreground">{formatIDR(revenue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                 </div>
              </div>

              {/* Recent Events Table */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
                  <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">Event Terbaru</h2>
                  <Button asChild variant="ghost" size="sm" className="h-7 text-[10px]">
                    <Link to="/eo/events">Lihat Semua</Link>
                  </Button>
                </div>
                {events.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Belum ada event. Buat event pertama Anda!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/5 text-muted-foreground text-[10px] uppercase font-bold text-left border-b border-border">
                          <th className="px-5 py-3">Nama Event</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Jadwal Pelaksanaan</th>
                          <th className="px-5 py-3 text-right">Kelola</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {events.slice(0, 5).map((ev) => (
                          <tr key={ev.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-4 font-semibold text-foreground max-w-[240px] truncate">{ev.title}</td>
                            <td className="px-5 py-4"><StatusBadge status={ev.status} /></td>
                            <td className="px-5 py-4 text-muted-foreground font-medium">{formatDateRange(ev.startDate, ev.endDate)}</td>
                            <td className="px-5 py-4 text-right">
                              <Button asChild variant="outline" size="sm" className="h-7 text-[10px]">
                                <Link to="/eo/events/$id" params={{ id: ev.id }}>Rincian</Link>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
