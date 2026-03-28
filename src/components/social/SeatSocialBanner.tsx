import { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Users, Sparkles, ArrowRight, UserCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { SetupProfileModal } from './SetupProfileModal'

interface SeatSocialBannerProps {
  eventId: string
  ticketId: string
  eventName: string
}

export function SeatSocialBanner({ eventId, ticketId, eventName }: SeatSocialBannerProps) {
  const [profile, setProfile] = useState<any>(null)
  const [isParticipant, setIsParticipant] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [joining, setJoining] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadStatus()
  }, [eventId])

  async function loadStatus() {
    setLoading(true)
    try {
      const [profData, participantsData] = await Promise.all([
        api.get<any>('/social/profile'),
        api.get<any>(`/social/events/${eventId}/participants`).catch(() => ({ notJoined: true, participants: [] }))
      ])
      
      setProfile(profData.profile)
      
      if (participantsData.notJoined) {
        setIsParticipant(false)
      } else {
        setIsParticipant(true)
      }

      // We need a separate endpoint for count or just trust the participants list if we could fetch it
      // For now, let's assume we can get a count even if not joined if we implement a public count endpoint
      // But per spec, we only see participants if we join. 
      // Let's just show a generic "Join other people" if not joined.
    } catch (err) {
      console.error('Failed to load social status', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(e: React.MouseEvent) {
    e.stopPropagation() // Prevent card click if any
    
    try {
      if (!profile) {
        setShowSetupModal(true)
        return
      }

      if (!isParticipant) {
        setJoining(true)
        try {
          await api.post(`/social/events/${eventId}/join`, { ticketId })
          setIsParticipant(true)
          toast.success('Berhasil bergabung dengan Seat Social!')
          navigate({ 
            to: '/dashboard/tickets/$ticketId/social',
            params: { ticketId }
          } as any)
        } catch (err: any) {
          console.error('Failed to join social', err)
          toast.error(err.message || 'Gagal bergabung ke Seat Social')
        } finally {
          setJoining(false)
        }
        return
      }

      navigate({ 
        to: '/dashboard/tickets/$ticketId/social',
        params: { ticketId }
      } as any)
    } catch (err: any) {
      console.error('handleAction error:', err)
      toast.error('Terjadi kesalahan. Silakan coba lagi.')
    }
  }

  if (loading) return null

  return (
    <div className="mt-4 p-4 rounded-xl border border-accent/20 bg-accent/5 overflow-hidden relative group">
      {/* Decorative background icon */}
      <Users className="absolute -right-4 -bottom-4 w-24 h-24 text-accent/5 -rotate-12 group-hover:scale-110 transition-transform" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Kenalan dengan peserta lain?</h3>
        </div>
        
        <p className="text-xs text-muted-foreground mb-4 max-w-[240px]">
          Aktifkan Seat Social untuk melihat siapa saja yang hadir di <strong>{eventName}</strong> dan mulai bertegur sapa!
        </p>

        <Button 
          size="sm" 
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2 shadow-sm"
          onClick={handleAction}
          disabled={joining}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : joining ? (
            'Menghubungkan...'
          ) : isParticipant ? (
            <>Lihat Peserta <ArrowRight size={14} /></>
          ) : (
            <>Aktifkan Seat Social</>
          )}
        </Button>
      </div>

      <SetupProfileModal 
        open={showSetupModal} 
        onOpenChange={setShowSetupModal}
        ticketId={ticketId}
        eventId={eventId}
        onSuccess={() => {
          setIsParticipant(true)
          navigate({ 
            to: '/dashboard/tickets/$ticketId/social',
            params: { ticketId }
          } as any)
        }}
      />
    </div>
  )
}
