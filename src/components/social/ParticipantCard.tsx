import { useState } from 'react'
import { AtSign, Check, Hand, Sparkles, UserCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { WaveModal } from './WaveModal'

interface Participant {
  participant_id: string
  joined_at: string
  display_name: string
  bio: string | null
  instagram_handle: string | null
  avatar_url: string | null
  wave_id: string | null
  wave_status: 'PENDING' | 'ACCEPTED' | 'IGNORED' | null
  wave_sender_id: string | null
}

interface ParticipantCardProps {
  participant: Participant
  eventId: string
  onWaveSuccess: () => void
}

export function ParticipantCard({ participant, eventId, onWaveSuccess }: ParticipantCardProps) {
  const [showWaveModal, setShowWaveModal] = useState(false)
  const [isWaving, setIsWaving] = useState(false)

  const isWaveSent = participant.wave_status === 'PENDING' && participant.wave_sender_id !== participant.participant_id
  const isWaveReceived = participant.wave_status === 'PENDING' && participant.wave_sender_id === participant.participant_id
  const isConnected = participant.wave_status === 'ACCEPTED'

  return (
    <div className="group relative bg-card border border-border rounded-2xl p-5 hover:border-accent/40 hover:shadow-lg transition-all border-b-4 border-b-transparent hover:border-b-accent/40">
      <div className="flex flex-col items-center text-center">
        {/* Avatar Section */}
        <div className="relative mb-4">
          <div className="absolute inset-0 bg-accent/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          {participant.avatar_url ? (
            <img 
              src={participant.avatar_url} 
              alt={participant.display_name} 
              className="w-20 h-20 rounded-full object-cover border-4 border-background shadow-md relative z-10"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-accent/10 border-4 border-background shadow-md flex items-center justify-center relative z-10">
              <UserCircle2 className="w-10 h-10 text-accent/40" />
            </div>
          )}
          
          {isConnected && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full border-2 border-background flex items-center justify-center z-20 shadow-sm animate-bounce">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>

        {/* Info Section */}
        <h3 className="font-bold text-foreground text-base leading-tight">
          {participant.display_name}
        </h3>
        
        {participant.instagram_handle && (
          <a 
            href={`https://instagram.com/${participant.instagram_handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent mt-1 bg-secondary/50 px-2 py-0.5 rounded-full transition-colors"
          >
            <AtSign size={10} />
            {participant.instagram_handle}
          </a>
        )}

        <p className="text-xs text-muted-foreground mt-3 line-clamp-2 min-h-[32px] leading-relaxed italic px-2">
          {participant.bio ? `"${participant.bio}"` : 'Halo semuanya! Yuk kenalan.'}
        </p>

        {/* Action Button */}
        <div className="w-full mt-5">
          {isConnected ? (
            <Button size="sm" variant="outline" className="w-full gap-2 border-emerald-500/30 bg-emerald-50/5 text-emerald-600 hover:bg-emerald-50/20 hover:text-emerald-700 cursor-default">
              Terhubung 🤝
            </Button>
          ) : isWaveSent ? (
            <Button size="sm" variant="outline" disabled className="w-full gap-2 bg-accent/5 opacity-80 border-accent/20">
              Dikirim <Check size={14} className="text-accent" />
            </Button>
          ) : isWaveReceived ? (
            <Button size="sm" variant="outline" disabled className="w-full gap-2 bg-amber-500/5 border-amber-500/20 text-amber-600">
               Menunggumu 🔔
            </Button>
          ) : (
            <Button 
              size="sm" 
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2 shadow-sm font-semibold active:scale-95 transition-all"
              onClick={() => setShowWaveModal(true)}
              disabled={isWaving}
            >
              <Hand size={14} /> Wave 👋
            </Button>
          )}
        </div>
      </div>

      <WaveModal 
        open={showWaveModal}
        onOpenChange={setShowWaveModal}
        receiverName={participant.display_name}
        receiverParticipantId={participant.participant_id}
        eventId={eventId}
        onSuccess={() => {
          onWaveSuccess()
          setIsWaving(false)
        }}
      />
    </div>
  )
}
