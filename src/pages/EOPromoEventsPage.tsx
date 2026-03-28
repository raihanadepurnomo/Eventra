import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { TicketPercent } from 'lucide-react'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { mapEvent } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import type { Event, EOProfile } from '@/types'
import { formatDateRange } from '@/lib/utils'

export default function EOPromoEventsPage() {
  const { dbUser } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

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
      if (!profile) {
        setEvents([])
        return
      }

      const rawEvents: any = await api.get(`/events?eo_profile_id=${profile.id}`)
      setEvents((rawEvents || []).map(mapEvent))
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat daftar event promo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <div className="flex items-center gap-2">
            <TicketPercent size={16} className="text-accent" />
            <h1 className="text-sm font-semibold text-foreground">Promo Code</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card">
              <p className="text-sm font-semibold text-foreground mb-1">Belum ada event</p>
              <p className="text-xs text-muted-foreground">Buat event terlebih dahulu untuk mengelola promo code.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Event</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Tanggal</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate max-w-52">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{event.category}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <StatusBadge status={event.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {formatDateRange(event.startDate, event.endDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="outline" className="text-xs h-8">
                          <Link to="/eo/events/$id/promos" params={{ id: event.id }}>
                            Kelola Promo
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
