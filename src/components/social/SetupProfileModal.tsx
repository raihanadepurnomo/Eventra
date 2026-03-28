import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Textarea } from '@/components/ui/Textarea'
import { AtSign, UserCircle2, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/components/ui/toast'

interface SetupProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (profile: any) => void
  ticketId?: string
  eventId?: string
}

export function SetupProfileModal({ open, onOpenChange, onSuccess, ticketId, eventId }: SetupProfileModalProps) {
  const { dbUser } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (dbUser && open) {
      setDisplayName(dbUser.name || '')
      loadProfile()
    }
  }, [dbUser, open])

  async function loadProfile() {
    try {
      const { profile } = await api.get<any>('/social/profile')
      if (profile) {
        setDisplayName(profile.display_name || dbUser?.name || '')
        setBio(profile.bio || '')
        setInstagramHandle(profile.instagram_handle || '')
      }
    } catch (err) {
      console.error('Failed to load profile', err)
    }
  }

  async function handleSave() {
    if (!displayName.trim()) {
      toast.error('Nama tampil wajib diisi')
      return
    }

    setSaving(true)
    try {
      // 1. Update/Create Social Profile
      const { profile } = await api.put<any>('/social/profile', {
        displayName: displayName.trim(),
        bio: bio.trim(),
        instagramHandle: instagramHandle.trim().replace(/^@/, '')
      })

      // 2. Join event if context is provided
      if (eventId && ticketId) {
        await api.post(`/social/events/${eventId}/join`, { ticketId })
      }

      toast.success('Profil Seat Social berhasil disimpan!')
      onSuccess(profile)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan profil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Profil Seat Social</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Bagikan profil Anda agar bisa saling menyapa di setiap event.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Avatar from Google Preview */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border">
            {dbUser?.image ? (
              <img src={dbUser.image} alt={dbUser.name} className="w-16 h-16 rounded-full object-cover border-2 border-background shadow-sm" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-2xl font-bold">
                {(displayName || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Foto Profil</p>
              <p className="text-xs text-muted-foreground mt-0.5">Otomatis menggunakan foto profil Google Anda.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName" className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">
              Nama Tampil <span className="text-destructive">*</span>
            </Label>
            <Input 
              id="displayName" 
              placeholder="Contoh: Budi S." 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-card/50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio" className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">
              Bio Singkat
            </Label>
            <Textarea 
              id="bio"
              placeholder="Ceritakan sedikit tentang dirimu... (max 160 karakter)"
              maxLength={160}
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="bg-card/50 resize-none h-24"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ig" className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">
              Instagram Handle (Opsional)
            </Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input 
                id="ig"
                placeholder="username_kamu"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                className="pl-9 bg-card/50"
              />
            </div>
          </div>

          <div className="p-3 bg-secondary/50 rounded-lg border border-border">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              ℹ️ Profil ini hanya tampil kepada sesama pembeli tiket yang juga mengaktifkan <strong>Seat Social</strong> untuk event yang sama.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="flex-1 sm:flex-none">
            Batal
          </Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 flex-1 sm:flex-none" onClick={handleSave} disabled={saving}>
            {saving ? 'Menyimpan...' : (eventId ? 'Simpan & Gabung' : 'Simpan Profil')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
