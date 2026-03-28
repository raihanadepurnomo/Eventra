import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Link } from '@tanstack/react-router'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing } from '@/lib/mappers'
import { formatDate, formatDateRange } from '@/lib/utils'
import type { Event, EOProfile } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'

type TabVal = 'all' | 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
interface EnrichedEvent { event: Event; eo: EOProfile | null }

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EnrichedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabVal>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const rawEvs: any = await api.get('/events')
      const evs = rawEvs.map(mapEvent)
      const enriched = await Promise.all(
        evs.map(async (ev) => {
          let eo: EOProfile | null = null
          try { 
            const rawEO: any = await api.get(`/eo-profiles/${ev.eoProfileId}`)
            eo = mapEOProfile(rawEO)
          } catch { /* ignore */ }
          return { event: ev, eo }
        })
      )
      setEvents(enriched)
    } finally {
      setLoading(false)
    }
  }

  async function changeStatus(eventId: string, status: 'PUBLISHED' | 'DRAFT' | 'CANCELLED') {
    await api.put(`/events/${eventId}`, { status, updatedAt: new Date().toISOString() })
    setEvents((prev) => prev.map((e) => e.event.id === eventId ? { ...e, event: { ...e.event, status } } : e))
    toast.success(`Status event diubah ke ${status}`)
  }

  const filtered = tab === 'all' ? events : events.filter((e) => e.event.status === tab)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Semua Event</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabVal)}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">Semua ({events.length})</TabsTrigger>
              <TabsTrigger value="PUBLISHED">Publik ({events.filter((e) => e.event.status === 'PUBLISHED').length})</TabsTrigger>
              <TabsTrigger value="DRAFT">Draft ({events.filter((e) => e.event.status === 'DRAFT').length})</TabsTrigger>
              <TabsTrigger value="CANCELLED">Dibatalkan ({events.filter((e) => e.event.status === 'CANCELLED').length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab}>
              {loading ? (
                <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Event</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Organizer</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Tanggal</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(({ event: ev, eo }) => (
                          <tr key={ev.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground truncate max-w-52">{ev.title}</p>
                              <p className="text-xs text-muted-foreground">{ev.category}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{eo?.orgName ?? '-'}</td>
                            <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={ev.status} /></td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{formatDateRange(ev.startDate, ev.endDate)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                                  <Link to="/events/$id" params={{ id: ev.id }}><ExternalLink size={12} /></Link>
                                </Button>
                                {ev.status !== 'PUBLISHED' && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700" onClick={() => changeStatus(ev.id, 'PUBLISHED')}>Publish</Button>
                                )}
                                {ev.status === 'PUBLISHED' && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => changeStatus(ev.id, 'DRAFT')}>Unpublish</Button>
                                )}
                              </div>
                            </td>
                          </tr>
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
