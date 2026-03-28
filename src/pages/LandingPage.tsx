import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Ticket, Search, ShieldCheck, Zap, Users, Calendar, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { api } from '@/lib/api'
import { formatDateRange, formatIDR } from '@/lib/utils'
import type { Event, TicketType } from '@/types'

const CATEGORY_GRADIENTS: Record<string, string> = {
  Konser: 'from-violet-500 to-purple-700',
  Festival: 'from-pink-500 to-rose-700',
  Seminar: 'from-blue-500 to-indigo-700',
  Workshop: 'from-orange-500 to-amber-700',
  Sports: 'from-green-500 to-emerald-700',
  Exhibition: 'from-yellow-500 to-amber-600',
  default: 'from-indigo-500 to-violet-700',
}

function FeaturedCard({ event, minPrice }: { event: Event; minPrice: number | null }) {
  const gradient = CATEGORY_GRADIENTS[event.category] ?? CATEGORY_GRADIENTS.default
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      className="group block rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className={`relative h-44 bg-gradient-to-br ${gradient}`}>
        {event.bannerImage ? (
          <img src={event.bannerImage} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Ticket className="w-10 h-10 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 text-xs font-semibold text-foreground">
          {event.category}
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm text-foreground line-clamp-2 mb-2.5 group-hover:text-accent transition-colors">
          {event.title}
        </h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar size={12} />
            <span>{formatDateRange(event.startDate, event.endDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin size={12} />
            <span className="truncate">{event.location}</span>
          </div>
        </div>
        {minPrice !== null && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Mulai dari</span>
            <span className="text-sm font-bold font-mono text-foreground">
              {minPrice === 0 ? 'GRATIS' : formatIDR(minPrice)}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

const STEPS = [
  { num: '01', icon: Search, title: 'Temukan Event', desc: 'Jelajahi ratusan event menarik di seluruh Indonesia — konser, seminar, festival, dan banyak lagi.' },
  { num: '02', icon: Ticket, title: 'Beli Tiket', desc: 'Pilih jenis tiket, bayar dengan aman melalui berbagai metode pembayaran yang tersedia.' },
  { num: '03', icon: ShieldCheck, title: 'Hadir & Nikmati', desc: 'Tunjukkan QR Code tiket di pintu masuk dan nikmati acara tanpa antrian panjang.' },
]

const BENEFITS = [
  { icon: Zap, title: 'Setup Cepat', desc: 'Buat event dan mulai jual tiket dalam hitungan menit, tanpa coding.' },
  { icon: ShieldCheck, title: 'Pembayaran Aman', desc: 'Terintegrasi dengan Midtrans — QRIS, transfer bank, kartu kredit, dan lebih banyak lagi.' },
  { icon: Users, title: 'Kelola Peserta', desc: 'Pantau penjualan secara real-time dan validasi kehadiran dengan QR Code.' },
]

// Helper to map DB snake_case to frontend camelCase
function mapEvent(e: Record<string, unknown>): Event {
  return {
    id: e.id as string,
    eoProfileId: (e.eo_profile_id ?? e.eoProfileId) as string,
    title: e.title as string,
    description: e.description as string,
    category: e.category as string,
    bannerImage: (e.banner_image ?? e.bannerImage) as string | undefined,
    location: e.location as string,
    locationUrl: (e.location_url ?? e.locationUrl) as string | undefined,
    startDate: (e.start_date ?? e.startDate) as string,
    endDate: (e.end_date ?? e.endDate) as string,
    status: e.status as Event['status'],
    createdAt: (e.created_at ?? e.createdAt) as string,
    updatedAt: (e.updated_at ?? e.updatedAt) as string,
  }
}

function mapTicketType(t: Record<string, unknown>): TicketType {
  return {
    id: t.id as string,
    eventId: (t.event_id ?? t.eventId) as string,
    name: t.name as string,
    description: t.description as string | undefined,
    price: Number(t.price),
    quota: Number(t.quota),
    sold: Number(t.sold),
    maxPerOrder: Number(t.max_per_order ?? t.maxPerOrder),
    saleStartDate: (t.sale_start_date ?? t.saleStartDate) as string,
    saleEndDate: (t.sale_end_date ?? t.saleEndDate) as string,
  }
}

export { mapEvent, mapTicketType }

export default function LandingPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [ticketMap, setTicketMap] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
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
      } catch {
        /* silently fail */
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(239_84%_67%_/_0.08),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/5 text-accent text-xs font-semibold mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Platform Tiket Modern untuk Indonesia
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight mb-6">
              Beli & Jual Tiket Event{' '}
              <span className="text-accent">dengan Mudah</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
              Eventra adalah platform tiket digital terpercaya untuk acara terbaik Indonesia. Beli tiket dengan aman, kelola event Anda, dan nikmati pengalaman tanpa kerumitan.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <Link to="/events">
                  Jelajahi Event <ArrowRight size={16} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/eo/setup">
                  Buat Event Saya
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events */}
      <section className="py-16 md:py-20 bg-secondary/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Event Pilihan</p>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">Temukan Event Menarik</h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              <Link to="/events">Lihat Semua <ArrowRight size={14} /></Link>
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl bg-background">
              <Ticket className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Belum ada event yang tersedia.</p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/eo/setup">Jadilah yang pertama membuat event</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.slice(0, 6).map((ev) => (
                <FeaturedCard key={ev.id} event={ev} minPrice={ticketMap[ev.id] ?? null} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Cara Kerja</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Tiga Langkah Mudah</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.num} className="relative flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-accent" />
                  </div>
                  <span className="absolute -top-2 -right-2 text-xs font-bold text-accent/60 font-mono">
                    {step.num}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Organizers */}
      <section className="py-16 md:py-20 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">Untuk Event Organizer</p>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Kelola Event Anda dengan Platform Modern</h2>
              <p className="text-primary-foreground/70 mb-6 leading-relaxed">
                Dari pembuatan event hingga laporan penjualan — semua dalam satu dashboard yang intuitif.
              </p>
              <div className="space-y-3 mb-8">
                {BENEFITS.map((b) => (
                  <div key={b.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                      <b.icon className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-0.5">{b.title}</p>
                      <p className="text-xs text-primary-foreground/60">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/eo/setup">Mulai Jual Tiket <ArrowRight size={16} className="ml-1" /></Link>
              </Button>
            </div>
            <div className="relative hidden md:block">
              <div className="bg-primary-foreground/5 border border-primary-foreground/10 rounded-2xl p-6 space-y-3">
                {['Total Tiket Terjual', 'Revenue Bulan Ini', 'Event Aktif'].map((label, i) => (
                  <div key={label} className="flex items-center justify-between p-3 bg-primary-foreground/5 rounded-lg border border-primary-foreground/10">
                    <span className="text-sm text-primary-foreground/70">{label}</span>
                    <span className="text-sm font-bold font-mono text-primary-foreground">
                      {i === 0 ? '1.247' : i === 1 ? 'Rp 48.500.000' : '12'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
