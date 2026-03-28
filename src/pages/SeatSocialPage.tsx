import { useState, useEffect } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { 
  Users, Search, Bell, ArrowLeft, Loader2, UserCircle2, 
  Sparkles, Hand, LogOut, Check, SearchX, MapPin, 
  Settings, UserPlus
} from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { ParticipantCard } from '@/components/social/ParticipantCard'
import { WaveInbox } from '@/components/social/WaveInbox'
import { SetupProfileModal } from '@/components/social/SetupProfileModal'

export default function SeatSocialPage() {
  const { ticketId } = useParams({ strict: false }) as { ticketId: string }
  const { dbUser } = useAuth()
  
  const [participants, setParticipants] = useState<any[]>([])
  const [eventData, setEventData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxCount, setInboxCount] = useState(0)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    loadData()
    const polling = setInterval(loadInboxCount, 30000) // Poll for wave count every 30s
    return () => clearInterval(polling)
  }, [ticketId])

  async function loadData() {
    setLoading(true)
    try {
      // 1. Get ticket to find eventId
      const ticket: any = await api.get(`/tickets/${ticketId}`)
      const tt: any = await api.get(`/ticket-types/${ticket.ticket_type_id}`)
      const event: any = await api.get(`/events/${tt.event_id}`)
      setEventData(event)

      // 2. Get participants (this also validates if we have joined)
      const data: any = await api.get(`/social/events/${event.id}/participants`)
      setParticipants(data.participants)
      loadInboxCount()
    } catch (err: any) {
      if (err.message.includes('join')) {
        setError('not_joined')
      } else {
        setError(err.message || 'Gagal memuat data')
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadInboxCount() {
    try {
      const data: any = await api.get('/social/waves/inbox/count')
      setInboxCount(data.count)
    } catch { /* ignore */ }
  }

  async function handleLeave() {
    if (!eventData || !confirm('Kamu tidak akan lagi tampil di list peserta event ini. Tetap lanjut?')) return
    setLeaving(true)
    try {
      await api.post(`/social/events/${eventData.id}/leave`)
      toast.success('Kamu telah keluar dari Seat Social event ini.')
      window.location.href = '/dashboard'
    } catch (err: any) {
      toast.error(err.message || 'Gagal keluar')
    } finally {
      setLeaving(false)
    }
  }

  const filteredParticipants = participants.filter(p => {
    const nameMatch = (p.display_name || '').toLowerCase().includes((searchQuery || '').toLowerCase())
    const bioMatch = p.bio && (p.bio || '').toLowerCase().includes((searchQuery || '').toLowerCase())
    return nameMatch || bioMatch
  })

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background selection:bg-accent/20">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center pt-20">
          <Loader2 className="w-10 h-10 text-accent animate-spin mb-4" />
          <p className="text-muted-foreground animate-pulse font-medium">Menghubungkan ke Seat Social...</p>
        </main>
      </div>
    )
  }

  if (error === 'not_joined') {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 max-w-lg mx-auto px-4 py-32 text-center">
          <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-accent" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Yuk Join Seat Social!</h1>
          <p className="text-muted-foreground mb-8">
            Kamu belum mengaktifkan Seat Social untuk event <strong>{eventData?.title}</strong>. Aktifkan sekarang untuk mulai menyapa peserta lain!
          </p>
          <Button 
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg"
            onClick={async () => {
              try {
                await api.post(`/social/events/${eventData.id}/join`, { ticketId })
                loadData()
              } catch (err) {
                setShowProfileModal(true)
              }
            }}
          >
            Aktifkan Sekarang
          </Button>
          <Button variant="ghost" className="mt-4" asChild>
            <Link to="/dashboard">Kembali ke Dashboard</Link>
          </Button>
          <SetupProfileModal 
            open={showProfileModal} 
            onOpenChange={setShowProfileModal} 
            eventId={eventData?.id}
            ticketId={ticketId}
            onSuccess={() => loadData()}
          />
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 max-w-lg mx-auto px-4 py-32 text-center flex flex-col items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <SearchX className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Terjadi Kesalahan</h1>
          <p className="text-muted-foreground mb-8 text-sm max-w-sm mx-auto">
            Gagal memuat data Seat Social. Pastikan tiket Anda valid dan koneksi internet stabil.
          </p>
          <Button asChild>
            <Link to="/dashboard">Kembali ke Dashboard</Link>
          </Button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-accent/20">
      <Navbar />
      
      {/* HEADER SECTION */}
      <section className="bg-gradient-to-b from-secondary/50 to-background border-b border-border pt-20 pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Link 
            to="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-accent transition-colors mb-6 group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            KEMBALI KE TICKET
          </Link>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-accent text-[10px] text-accent-foreground font-bold tracking-widest uppercase">
                  SEAT SOCIAL
                </span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Hand size={12} className="text-accent" /> {participants.length} Peserta bergabung
                </span>
              </div>
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight sm:text-4xl">
                {eventData?.title}
              </h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><MapPin size={14} className="text-accent/60" /> {eventData?.location}</span>
                <span className="w-px h-3 bg-border" />
                <span>{new Date(eventData?.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                className="relative gap-2 bg-background shadow-sm border-border hover:border-accent/40"
                onClick={() => setInboxOpen(true)}
              >
                <Bell size={16} className={cn(inboxCount > 0 && "text-accent")} /> 
                <span className="hidden sm:inline">Kotak Masuk Wave</span>
                {inboxCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background animate-bounce shadow-sm">
                    {inboxCount}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FILTER & GRID SECTION */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Cari nama atau bio peserta..."
              className="pl-10 h-11 bg-muted/20 border-border/50 focus:bg-background transition-all rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
             <div className="flex items-center gap-1.5 bg-accent/5 px-3 py-2 rounded-xl border border-accent/10 text-accent">
               <Sparkles size={14} /> Newest First
             </div>
          </div>
        </div>

        {filteredParticipants.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-center bg-muted/10 rounded-3xl border-2 border-dashed border-border/50">
            <SearchX className="w-16 h-16 text-muted-foreground/20 mb-4" />
            <h3 className="font-bold text-lg text-foreground">Peserta tidak ditemukan</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
              Tidak ada peserta yang cocok dengan kata kunci "{searchQuery}".
            </p>
            <Button variant="ghost" className="mt-4" onClick={() => setSearchQuery('')}>Hapus Pencarian</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredParticipants.map(participant => (
              <ParticipantCard 
                key={participant.participant_id} 
                participant={participant}
                eventId={eventData.id}
                onWaveSuccess={() => {
                  loadInboxCount()
                  // Reload participants locally or just force refetch
                  const updated = participants.map(p => {
                    if (p.participant_id === participant.participant_id) {
                      return { ...p, wave_id: 'pending', wave_status: 'PENDING', wave_sender_id: 'me_simulated' }
                    }
                    return p
                  })
                  setParticipants(updated)
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* STICKY TAB FOR MY PROFILE */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <div className="bg-background/80 backdrop-blur-xl border border-border px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-6 ring-1 ring-black/5">
           <div className="flex items-center gap-3 pr-6 border-r border-border">
              {dbUser?.image ? (
                <img src={dbUser.image} className="w-9 h-9 rounded-full object-cover border-2 border-accent/20" alt="" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent"><UserCircle2 size={18} /></div>
              )}
              <div className="hidden sm:block">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Profil Saya</p>
                <p className="text-sm font-bold leading-tight">{(dbUser?.name || 'User').split(' ')[0]}</p>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowProfileModal(true)}
                className="p-2 hover:bg-accent/10 text-muted-foreground hover:text-accent rounded-full transition-all"
                title="Edit Profil"
              >
                <Settings size={20} />
              </button>
              <button 
                onClick={handleLeave}
                disabled={leaving}
                className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-all"
                title="Keluar dari Seat Social"
              >
                <LogOut size={20} />
              </button>
           </div>
        </div>
      </div>

      <WaveInbox 
        open={inboxOpen} 
        onOpenChange={setInboxOpen}
        onActionSuccess={() => {
          loadData() // Refresh everything on wave acceptance
          loadInboxCount()
        }}
      />
      
      <SetupProfileModal 
        open={showProfileModal} 
        onOpenChange={setShowProfileModal}
        onSuccess={() => {
          loadData()
          window.location.reload()
        }}
      />

      <Footer />
    </div>
  )
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}
