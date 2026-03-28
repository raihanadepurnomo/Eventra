import { useState, useEffect } from 'react'
import { Clock, Building2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Label } from '@/components/ui/Label'
import { toast } from '@/components/ui/toast'
import { Link } from '@tanstack/react-router'
import { Navbar } from '@/components/layout/Navbar'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import type { EOProfile } from '@/types'

type State = 'loading' | 'form' | 'pending' | 'suspended'

export default function EOSetupPage() {
  const { dbUser } = useAuth()
  const [state, setState] = useState<State>('loading')
  const [eoProfile, setEOProfile] = useState<EOProfile | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ orgName: '', description: '', phone: '' })

  useEffect(() => {
    if (!dbUser) return
    checkProfile()
  }, [dbUser])

  async function checkProfile() {
    if (!dbUser) return
    try {
      const rawProfiles = await api.get(`/eo-profiles?user_id=${dbUser.id}`) as any[]
      const profile = rawProfiles.map(mapEOProfile)[0]
      if (!profile) {
        setState('form')
      } else {
        setEOProfile(profile)
        if (profile.status === 'PENDING') setState('pending')
        else if (profile.status === 'SUSPENDED') setState('suspended')
        else setState('form')
      }
    } catch {
      setState('form')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dbUser) return
    if (!form.orgName.trim()) { toast.error('Nama organisasi wajib diisi'); return }

    setSubmitting(true)
    try {
      const profileId = crypto.randomUUID()
      await api.post('/eo-profiles', {
        id: profileId,
        userId: dbUser.id,
        org_name: form.orgName.trim(),
        description: form.description.trim() || undefined,
        phone: form.phone.trim() || undefined,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      })

      toast.success('Pendaftaran berhasil! Menunggu persetujuan admin.')
      // Force a full page reload so auth state picks up the new EO role
      // Land on /eo/setup so pending state is shown (not /eo/dashboard which would loop)
      setTimeout(() => { window.location.href = '/eo/setup' }, 1500)
    } catch {
      toast.error('Gagal mendaftar. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-14 flex items-center justify-center px-4 py-12">
        {state === 'loading' && (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
          </div>
        )}

        {state === 'form' && (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-6 h-6 text-accent" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Daftar sebagai Event Organizer</h1>
              <p className="text-sm text-muted-foreground">Isi profil organisasi Anda untuk mulai membuat event</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="orgName">Nama Organisasi <span className="text-destructive">*</span></Label>
                <Input
                  id="orgName"
                  placeholder="Contoh: Promotor Event Indonesia"
                  value={form.orgName}
                  onChange={(e) => setForm((f) => ({ ...f, orgName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Deskripsi Organisasi</Label>
                <Textarea
                  id="description"
                  placeholder="Ceritakan tentang organisasi Anda..."
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Nomor Telepon</Label>
                <Input
                  id="phone"
                  placeholder="+62 812 3456 7890"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90 mt-2" disabled={submitting}>
                {submitting ? 'Mendaftarkan...' : 'Daftar sebagai EO'}
              </Button>
            </form>
          </div>
        )}

        {state === 'pending' && (
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">Akun Sedang Direview</h1>
            <p className="text-muted-foreground mb-2 leading-relaxed">
              Permohonan Anda sebagai <strong>{eoProfile?.orgName ?? 'Event Organizer'}</strong> sedang dalam proses review oleh tim kami.
            </p>
            <p className="text-sm text-muted-foreground mb-8">Estimasi waktu: 1×24 jam kerja</p>
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-left mb-6">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">Anda akan mendapat notifikasi email setelah akun disetujui atau ditolak.</p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link to="/">Kembali ke Beranda</Link>
            </Button>
          </div>
        )}

        {state === 'suspended' && (
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">Akun Ditangguhkan</h1>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Akun Event Organizer Anda telah ditangguhkan. Hubungi tim kami untuk informasi lebih lanjut.
            </p>
            <Button asChild variant="outline">
              <Link to="/">Kembali ke Beranda</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
