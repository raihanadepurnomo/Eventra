import { useState, useEffect } from 'react'
import { X, Sparkles, Hand, Check, XCircle, Bell, MessageSquareQuote } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface Wave {
  id: string
  event_id: string
  sender_id: string
  message: string | null
  status: 'PENDING' | 'ACCEPTED' | 'IGNORED'
  created_at: string
  sender_name: string
  sender_avatar: string | null
  event_title: string
}

interface WaveInboxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onActionSuccess: () => void
}

export function WaveInbox({ open, onOpenChange, onActionSuccess }: WaveInboxProps) {
  const [waves, setWaves] = useState<Wave[]>([])
  const [loading, setLoading] = useState(false)
  const [responding, setResponding] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadWaves()
    }
  }, [open])

  async function loadWaves() {
    setLoading(true)
    try {
      const data = await api.get<any>('/social/waves/inbox')
      setWaves(data.waves)
    } catch (err) {
      console.error('Failed to load waves', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleRespond(waveId: string, action: 'ACCEPTED' | 'IGNORED') {
    setResponding(waveId)
    try {
      await api.post(`/social/waves/${waveId}/respond`, { action })
      toast.success(action === 'ACCEPTED' ? 'Wave berhasil dibalas! 🎉' : 'Wave diabaikan.')
      onActionSuccess()
      setWaves(prev => prev.map(w => w.id === waveId ? { ...w, status: action } : w))
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses wave')
    } finally {
      setResponding(null)
    }
  }

  return (
    <div className={cn(
      "fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-background border-l border-border shadow-2xl transition-transform duration-300 ease-in-out transform",
      open ? "translate-x-0" : "translate-x-full"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
            <Bell className="w-4 h-4 text-accent" />
          </div>
          <h2 className="font-bold text-lg">Kotak Masuk Wave</h2>
          {waves.filter(w => w.status === 'PENDING').length > 0 && (
            <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
              {waves.filter(w => w.status === 'PENDING').length}
            </span>
          )}
        </div>
        <button 
          onClick={() => onOpenChange(false)}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <X size={20} className="text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="h-full overflow-y-auto pb-20 p-4 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-8 h-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
            <p className="text-sm text-muted-foreground">Memuat sapaan...</p>
          </div>
        ) : waves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Hand className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <h3 className="font-bold text-foreground mb-1">Kotak Masuk Kosong</h3>
            <p className="text-xs text-muted-foreground">
              Belum ada sapaan baru yang masuk. Yuk mulai menyapa peserta lain lebih dulu!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {waves.map((wave) => (
              <div key={wave.id} className="p-4 rounded-2xl bg-card border border-border shadow-sm group">
                <div className="flex items-start gap-3">
                  {wave.sender_avatar ? (
                    <img src={wave.sender_avatar} alt={wave.sender_name} className="w-10 h-10 rounded-full object-cover border border-background" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold">
                      {(wave.sender_name || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex items-center h-full pt-1">
                    <p className="text-sm text-foreground leading-tight truncate">
                      <span className="font-bold">{wave.sender_name || 'Peserta Tanpa Nama'}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">di <strong className="font-semibold">{wave.event_title}</strong></span>
                    </p>
                  </div>
                </div>

                {wave.message && (
                  <div className="mt-3 p-3 rounded-xl bg-accent/5 border border-accent/10 relative">
                    <MessageSquareQuote size={12} className="text-accent/30 absolute -top-1.5 -left-1.5" />
                    <p className="text-xs text-foreground italic leading-relaxed">"{wave.message}"</p>
                  </div>
                )}

                {wave.status === 'PENDING' ? (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
                    <Button 
                      size="sm" 
                      className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-bold h-9"
                      onClick={() => handleRespond(wave.id, 'ACCEPTED')}
                      disabled={!!responding}
                    >
                      {responding === wave.id ? 'Memproses...' : <>Balas Wave 👋</>}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-9 hover:bg-destructive/10 hover:text-destructive group"
                      onClick={() => handleRespond(wave.id, 'IGNORED')}
                      disabled={!!responding}
                    >
                      <XCircle size={16} className="text-muted-foreground group-hover:text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2 text-xs font-semibold">
                    {wave.status === 'ACCEPTED' ? (
                      <span className="text-emerald-600 flex items-center gap-1.5"><Check className="w-4 h-4" /> Telah saling terhubung</span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1.5"><XCircle className="w-4 h-4" /> Wave diabaikan</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
