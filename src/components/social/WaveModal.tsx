import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Sparkles, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toast'

interface WaveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receiverName: string
  receiverParticipantId: string
  eventId: string
  onSuccess: () => void
}

export function WaveModal({ open, onOpenChange, receiverName, receiverParticipantId, eventId, onSuccess }: WaveModalProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    setSending(true)
    try {
      await api.post('/social/waves', {
        receiverParticipantId,
        eventId,
        message: message.trim() || null
      })
      toast.success(`Wave berhasil dikirim ke ${receiverName}!`)
      onSuccess()
      onOpenChange(false)
      setMessage('')
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengirim wave')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-background border-border">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <DialogTitle>Kirim Wave ke {receiverName}</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Sapa {receiverName} dengan pesan singkat (opsional).
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Textarea 
            placeholder="Ketik pesan sapaanmu... (max 100 karakter)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={100}
            rows={3}
            className="bg-muted/30 resize-none h-24 text-sm"
          />
          <div className="flex justify-end mt-1">
            <span className="text-[10px] text-muted-foreground">{message.length}/100</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
            Batal
          </Button>
          <Button size="sm" className="bg-accent text-accent-foreground gap-2" onClick={handleSend} disabled={sending}>
            {sending ? 'Mengirim...' : <>Kirim Wave <Send size={14} /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
