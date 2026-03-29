// @ts-nocheck
import { useEffect, useState, useMemo } from 'react'
import { Users, Search, CheckCircle2, XCircle, Clock, CreditCard, Filter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapUser } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatIDR, formatDate } from '@/lib/utils'
import type { Event, EOProfile, TicketType, Order, OrderItem, Ticket, User } from '@/types'

interface AttendeeRow {
  order: Order
  items: OrderItem[]
  tickets: Ticket[]
  user: User | null
  event: Event | null
  ticketTypeName: string
  totalQty: number
  scannedCount: number
}

export default function EOAttendeesPage() {
  const { dbUser } = useAuth()
  const [profile, setProfile] = useState<EOProfile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [rows, setRows] = useState<AttendeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [filterEvent, setFilterEvent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    if (!dbUser) return
    loadData()
  }, [dbUser])

  async function loadData() {
    if (!dbUser) return
    setLoading(true)
    try {
      // 1. EO Profile
      const rawProfiles: any = await api.get(`/eo-profiles?user_id=${dbUser.id}`)
      const p = rawProfiles.map(mapEOProfile)[0]
      if (!p) return
      setProfile(p)

      // 2. All events for this EO
      const rawEvs: any = await api.get(`/events?eo_profile_id=${p.id}`)
      const evs = rawEvs.map(mapEvent)
      setEvents(evs)
      if (evs.length === 0) { setLoading(false); return }

      // 3. Ticket types for all events
      const allTTs: TicketType[] = []
      for (const ev of evs) {
        const rawTTs: any = await api.get(`/ticket-types?event_id=${ev.id}`)
        allTTs.push(...rawTTs.map(mapTicketType))
      }
      const ttMap = new Map(allTTs.map(t => [t.id, t]))
      const evMap = new Map(evs.map((e: Event) => [e.id, e]))

      // 4. For each ticket type, get order items that reference it
      const rawItemsAll: any = await api.get('/order-items')
      const allMappedItems = rawItemsAll.map(mapOrderItem)
      const allRelevantItems = allMappedItems.filter((item: OrderItem) => ttMap.has(item.ticketTypeId))

      if (allRelevantItems.length === 0) { setRows([]); setLoading(false); return }

      // 5. Get all orders for this EO (includes other users' orders for these events)
      const rawOrders: any = await api.get(`/orders?eo_profile_id=${p.id}`)
      const allOrders = rawOrders.map(mapOrder)
      const orderMap = new Map(allOrders.map((o: Order) => [o.id, o]))
      const uniqueOrderIds = allOrders.map((o: Order) => o.id)

      // 6. Get tickets for these orders
      const ticketsByOrder = new Map<string, Ticket[]>()
      for (const oid of uniqueOrderIds) {
        try {
          const rawTix: any = await api.get(`/tickets?order_id=${oid}`)
          ticketsByOrder.set(oid, rawTix.map(mapTicket))
        } catch {}
      }

      // 7. Fetch unique users
      const userIds = [...new Set([...orderMap.values()].map(o => o.userId))]
      const userMap = new Map<string, User>()
      for (const uid of userIds) {
        try {
          const rawU: any = await api.get(`/users/${uid}`)
          userMap.set(uid, mapUser(rawU))
        } catch {}
      }

      // 8. Build rows - group by order
      const attendeeRows: AttendeeRow[] = []
      for (const orderId of uniqueOrderIds) {
        const order = orderMap.get(orderId)
        if (!order) continue
        const items = allRelevantItems.filter(i => i.orderId === orderId)
        const tickets = ticketsByOrder.get(orderId) || []
        const user = userMap.get(order.userId) || null

        const firstItem = items[0]
        const tt = firstItem ? ttMap.get(firstItem.ticketTypeId) : null
        const event = tt ? evMap.get(tt.eventId) || null : null
        const ticketTypeName = items.map(i => ttMap.get(i.ticketTypeId)?.name || '?').join(', ')
        const totalQty = tickets.length > 0
          ? tickets.filter(t => t.status !== 'TRANSFERRED').reduce((s, t) => s + Number(t.quantity || 1), 0)
          : items.reduce((s, i) => s + i.quantity, 0)
        // Only count as scanned if status is actually 'USED' (not 'TRANSFERRED' or others)
        const scannedCount = tickets.filter(t => t.status === 'USED').reduce((s, t) => s + (t.quantity || 1), 0)
        const isResaleOrder = orderId.startsWith('rord_')
        const isTransferred = tickets.some(t => t.status === 'TRANSFERRED')

        attendeeRows.push({ order, items, tickets, user, event, ticketTypeName, totalQty, scannedCount, isResaleOrder, isTransferred })
      }

      attendeeRows.sort((a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime())
      setRows(attendeeRows)
    } catch (err) {
      console.error('[EOAttendees] loadData error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterEvent !== 'all' && r.event?.id !== filterEvent) return false
      if (filterStatus !== 'all' && r.order.status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        const name = r.user?.name?.toLowerCase() || ''
        const email = r.user?.email?.toLowerCase() || ''
        const orderId = r.order.id.toLowerCase()
        if (!name.includes(q) && !email.includes(q) && !orderId.includes(q)) return false
      }
      return true
    })
  }, [rows, filterEvent, filterStatus, search])

  const stats = useMemo(() => {
    const paid = rows.filter(r => r.order.status === 'PAID').length
    const pending = rows.filter(r => r.order.status === 'PENDING').length
    const cancelled = rows.filter(r => r.order.status === 'CANCELLED').length
    const scanned = rows.reduce((s, r) => s + r.scannedCount, 0)
    const totalTickets = rows.filter(r => r.order.status === 'PAID').reduce((s, r) => s + r.totalQty, 0)
    return { paid, pending, cancelled, scanned, totalTickets }
  }, [rows])

  function getStatusBadge(status: string) {
    switch (status) {
      case 'PAID':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 size={10} /> Lunas</span>
      case 'PENDING':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Clock size={10} /> Pending</span>
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircle size={10} /> Gagal</span>
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{status}</span>
    }
  }

  function getScanBadge(row: AttendeeRow) {
    if (row.order.status !== 'PAID') return <span className="text-xs text-muted-foreground">—</span>
    if (row.scannedCount >= row.totalQty) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 size={10} /> Sudah Scan</span>
    }
    if (row.isTransferred) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Pindah Tangan</span>
    }
    if (row.scannedCount > 0) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{row.scannedCount}/{row.totalQty} Scan</span>
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><Clock size={10} /> Belum Scan</span>
  }

  async function handleExportAttendees() {
    if (!filterEvent || filterEvent === 'all') {
      toast.error('Pilih event terlebih dahulu sebelum export.')
      return
    }

    setExporting(true)
    try {
      const token = localStorage.getItem('eventra_token')
      const response = await fetch(`/api/eo/events/${filterEvent}/attendees/export`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (!response.ok) {
        let message = 'Gagal export attendees.'
        try {
          const err = await response.json()
          if (err?.error) message = err.error
        } catch {}
        throw new Error(message)
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const fallbackName = `attendees-${filterEvent}.xlsx`
      const filenameMatch = disposition.match(/filename="?([^\";]+)"?/) || disposition.match(/filename\*=UTF-8''([^;]+)/)
      const filename = decodeURIComponent(filenameMatch?.[1] || fallbackName)

      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)

      toast.success('File attendee berhasil diexport.')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal export attendees.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Daftar Peserta</h1>
            {profile && <p className="text-xs text-muted-foreground">{profile.orgName}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleExportAttendees} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export Excel'}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={loadData}>
              Refresh
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Stats strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-lg border border-border bg-card p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{rows.length}</p>
                  <p className="text-xs text-muted-foreground">Total Pesanan</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                  <p className="text-lg font-bold text-emerald-700">{stats.paid}</p>
                  <p className="text-xs text-emerald-600">Lunas</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-center">
                  <p className="text-lg font-bold text-amber-700">{stats.pending}</p>
                  <p className="text-xs text-amber-600">Pending</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-center">
                  <p className="text-lg font-bold text-red-700">{stats.cancelled}</p>
                  <p className="text-xs text-red-600">Gagal</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-center">
                  <p className="text-lg font-bold text-blue-700">{stats.scanned}/{stats.totalTickets}</p>
                  <p className="text-xs text-blue-600">Sudah Scan</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">Cari Peserta</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Nama, email, atau Order ID..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="min-w-[160px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">Event</Label>
                  <select
                    value={filterEvent}
                    onChange={e => setFilterEvent(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    <option value="all">Semua Event</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                  </select>
                </div>
                <div className="min-w-[130px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    <option value="all">Semua</option>
                    <option value="PAID">Lunas</option>
                    <option value="PENDING">Pending</option>
                    <option value="CANCELLED">Gagal</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Peserta</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Event</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Tipe Tiket</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Total</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Pembayaran</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Scan</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            Belum ada data peserta.
                          </td>
                        </tr>
                      ) : (
                        filtered.map(row => (
                          <tr key={row.order.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-foreground text-sm">{row.user?.name || '—'}</p>
                                {row.isResaleOrder && (
                                  <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold">RESALE</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{row.user?.email || '—'}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-foreground max-w-40 truncate">{row.event?.title || '—'}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-foreground">{row.ticketTypeName}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-mono text-sm">{row.totalQty}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-mono text-sm font-medium">{formatIDR(row.order.totalAmount)}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {getStatusBadge(row.order.status)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {getScanBadge(row)}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-muted-foreground">{formatDate(row.order.createdAt)}</p>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
