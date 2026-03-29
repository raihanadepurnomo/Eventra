import { useState, useEffect, useMemo } from 'react'
import { Search, SlidersHorizontal, Calendar, MapPin, Ticket, ArrowUpDown, Star } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/Select'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { api } from '@/lib/api'
import { formatDateRange, formatIDR } from '@/lib/utils'
import { mapEvent, mapTicketType } from './LandingPage'
import type { Event, TicketType } from '@/types'
import { SEO } from '@/components/shared/SEO'

const CATEGORIES = ['Semua', 'Konser', 'Seminar', 'Festival', 'Workshop', 'Exhibition', 'Sports', 'Lainnya']

const SORT_OPTIONS = [
  { label: 'Terbaru', value: 'date_desc' },
  { label: 'Terlama', value: 'date_asc' },
  { label: 'Harga Terendah', value: 'price_asc' },
  { label: 'Harga Tertinggi', value: 'price_desc' },
]

const GRADIENT_MAP: Record<string, string> = {
  Konser: 'from-violet-500 to-purple-700',
  Festival: 'from-pink-500 to-rose-700',
  Seminar: 'from-blue-500 to-indigo-700',
  Workshop: 'from-orange-500 to-amber-700',
  Sports: 'from-green-500 to-emerald-700',
  Exhibition: 'from-yellow-500 to-amber-600',
  default: 'from-indigo-500 to-violet-700',
}

const BADGE_MAP: Record<string, string> = {
  Konser: 'bg-violet-100 text-violet-700',
  Festival: 'bg-pink-100 text-pink-700',
  Seminar: 'bg-blue-100 text-blue-700',
  Workshop: 'bg-orange-100 text-orange-700',
  Sports: 'bg-green-100 text-green-700',
  Exhibition: 'bg-yellow-100 text-yellow-700',
  default: 'bg-indigo-100 text-indigo-700',
}

function EventCard({ event, minPrice }: { event: Event; minPrice: number | null }) {
  const gradient = GRADIENT_MAP[event.category] ?? GRADIENT_MAP.default
  const badge = BADGE_MAP[event.category] ?? BADGE_MAP.default
  return (
    <Link to="/events/$id" params={{ id: event.id }} className="group block rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className={`relative h-44 bg-gradient-to-br ${gradient}`}>
        {event.bannerImage ? (<img src={event.bannerImage} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />) : (<div className="absolute inset-0 flex items-center justify-center"><Ticket className="w-10 h-10 text-white/20" /></div>)}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold ${badge}`}>{event.category}</span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm text-foreground line-clamp-2 mb-2.5 group-hover:text-accent transition-colors">{event.title}</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Calendar size={12} /><span>{formatDateRange(event.startDate, event.endDate)}</span></div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={12} /><span className="truncate">{event.location}</span></div>
        </div>
        {minPrice !== null && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Mulai dari</span>
            {minPrice === 0 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                GRATIS
              </span>
            ) : (
              <span className="text-sm font-bold font-mono text-foreground">{formatIDR(minPrice)}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

const PAGE_SIZE = 12

export default function BrowseEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [ticketMap, setTicketMap] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Semua')
  const [sort, setSort] = useState('date_desc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const rawData = await api.get<Record<string, unknown>[]>('/events?status=PUBLISHED')
        const data = rawData.map(mapEvent)
        setEvents(data)
        const rawTts = await api.get<Record<string, unknown>[]>('/ticket-types')
        const allTts = rawTts.map(mapTicketType)
        const map: Record<string, number | null> = {}
        for (const ev of data) {
          const evTts = allTts.filter(t => t.eventId === ev.id)
          const prices = evTts.map(t => t.price)
          map[ev.id] = prices.length > 0 ? Math.min(...prices) : null
        }
        setTicketMap(map)
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    let result = events.filter((ev) => {
      const matchSearch = ev.title.toLowerCase().includes(search.toLowerCase()) || ev.location.toLowerCase().includes(search.toLowerCase())
      const matchCat = category === 'Semua' || ev.category === category
      return matchSearch && matchCat
    })
    result = [...result].sort((a, b) => {
      if (sort === 'date_desc') return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      if (sort === 'date_asc') return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      if (sort === 'price_asc') return (ticketMap[a.id] ?? Infinity) - (ticketMap[b.id] ?? Infinity)
      if (sort === 'price_desc') return (ticketMap[b.id] ?? -1) - (ticketMap[a.id] ?? -1)
      return 0
    })
    return result
  }, [events, search, category, sort, ticketMap])

  const featured = useMemo(() => [...events].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).slice(0, 3), [events])
  const paginated = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = paginated.length < filtered.length

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO 
        title="Jelajahi Event" 
        description="Temukan konser, seminar, festival, dan workshop di kotamu."
        url="https://eventra.raihanadepurnomo.dev/events"
      />
      <Navbar />
      <main className="flex-1 pt-14">
        <div className="border-b border-border bg-secondary/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Jelajahi Event</h1>
            <p className="text-sm text-muted-foreground">{loading ? '...' : `${filtered.length} event tersedia`}</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!loading && featured.length > 0 && !search && category === 'Semua' && (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Event Unggulan</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {featured.map((ev) => (<EventCard key={ev.id} event={ev} minPrice={ticketMap[ev.id] ?? null} />))}
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Cari event, lokasi..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
              </Select>
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{SORT_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 9 }).map((_, i) => (<Skeleton key={i} className="h-64 rounded-xl" />))}
            </div>
          ) : paginated.length === 0 ? (
            <div className="text-center py-24 border border-dashed border-border rounded-xl">
              <Ticket className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground mb-1">Tidak ada event ditemukan</p>
              <p className="text-sm text-muted-foreground">Coba kata kunci atau filter yang berbeda.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginated.map((ev) => (<EventCard key={ev.id} event={ev} minPrice={ticketMap[ev.id] ?? null} />))}
              </div>
              {hasMore && (
                <div className="text-center mt-10">
                  <Button variant="outline" onClick={() => setPage((p) => p + 1)}>Muat Lebih Banyak</Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}