import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus, Calendar, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatDateRange } from '@/lib/utils'
import type { Event, EOProfile } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'

type TabVal = 'all' | 'DRAFT' | 'PUBLISHED' | 'COMPLETED'

export default function EOEventsPage() {
  const { dbUser } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabVal>('all')

  useEffect(() => {
    if (!dbUser) return
    load()
  }, [dbUser])

  async function load() {
    if (!dbUser) return
    setLoading(true)
    try {
      const profiles = await api.get(`/eo-profiles?user_id=${dbUser.id}`)
      const profile = (profiles as EOProfile[])[0]
      if (!profile) return
      const rawEvs: any = await api.get(`/events?eo_profile_id=${profile.id}`)
      setEvents(rawEvs.map(mapEvent))
    } finally {
      setLoading(false)
    }
  }

  async function handlePublish(eventId: string) {
    try {
      await api.put(`/events/${eventId}`, { status: 'PUBLISHED', updatedAt: new Date().toISOString() })
      setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, status: 'PUBLISHED' } : e))
      toast.success('Event dipublikasikan!')
    } catch {
      toast.error('Gagal mempublikasikan event.')
    }
  }

  async function handleUnpublish(eventId: string) {
    try {
      await api.put(`/events/${eventId}`, { status: 'DRAFT', updatedAt: new Date().toISOString() })
      setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, status: 'DRAFT' } : e))
      toast.success('Event dikembalikan ke draft.')
    } catch {
      toast.error('Gagal.')
    }
  }

  const filtered = tab === 'all' ? events : events.filter((e) => e.status === tab)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Event Saya</h1>
          <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/eo/events/create"><Plus size={14} className="mr-1" /> Buat Event</Link>
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabVal)}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">Semua ({events.length})</TabsTrigger>
              <TabsTrigger value="DRAFT">Draft ({events.filter((e) => e.status === 'DRAFT').length})</TabsTrigger>
              <TabsTrigger value="PUBLISHED">Publik ({events.filter((e) => e.status === 'PUBLISHED').length})</TabsTrigger>
              <TabsTrigger value="COMPLETED">Selesai ({events.filter((e) => e.status === 'COMPLETED').length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab}>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Tidak ada event di tab ini.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Event</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Tanggal</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((ev) => (
                        <tr key={ev.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground truncate max-w-52">{ev.title}</p>
                            <p className="text-xs text-muted-foreground">{ev.category}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={ev.status} /></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{formatDateRange(ev.startDate, ev.endDate)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {ev.status === 'DRAFT' && (
                                <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => handlePublish(ev.id)}>
                                  Publikasikan
                                </Button>
                              )}
                              {ev.status === 'PUBLISHED' && (
                                <>
                                  <Button asChild size="sm" variant="ghost" className="text-xs h-7">
                                    <Link to="/events/$id" params={{ id: ev.id }}><ExternalLink size={12} /></Link>
                                  </Button>
                                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleUnpublish(ev.id)}>
                                    Unpublish
                                  </Button>
                                </>
                              )}
                              <Button asChild size="sm" variant="ghost" className="text-xs h-7">
                                <Link to="/eo/events/$id" params={{ id: ev.id }}>Edit</Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  )
}
