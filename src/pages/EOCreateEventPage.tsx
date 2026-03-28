import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Label } from '@/components/ui/Label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/Select'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import type { EOProfile } from '@/types'
import { cn } from '@/lib/utils'

const CATEGORIES = ['Konser', 'Seminar', 'Festival', 'Workshop', 'Exhibition', 'Sports', 'Lainnya']

interface TicketForm { name: string; description: string; price: string; quota: string; maxPerOrder: string; maxPerAccount: string; saleStartDate: string; saleEndDate: string }
interface EventForm { title: string; category: string; description: string; bannerImage: string; bannerFile: File | null; startDate: string; endDate: string; location: string; locationUrl: string; isResaleAllowed: boolean }

const defaultTicket = (): TicketForm => ({ name: '', description: '', price: '0', quota: '100', maxPerOrder: '5', maxPerAccount: '0', saleStartDate: '', saleEndDate: '' })

const STEPS = ['Info Dasar', 'Jadwal & Lokasi', 'Jenis Tiket', 'Review & Publish']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors', i < current ? 'bg-accent border-accent text-white' : i === current ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted-foreground bg-background')}>
              {i < current ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span className={cn('text-xs mt-1 hidden sm:block whitespace-nowrap', i === current ? 'text-accent font-medium' : 'text-muted-foreground')}>{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={cn('h-0.5 flex-1 mx-1', i < current ? 'bg-accent' : 'bg-border')} />}
        </div>
      ))}
    </div>
  )
}

export default function EOCreateEventPage() {
  const { dbUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<EventForm>({ title: '', category: '', description: '', bannerImage: '', bannerFile: null, startDate: '', endDate: '', location: '', locationUrl: '', isResaleAllowed: false })
  const [tickets, setTickets] = useState<TicketForm[]>([defaultTicket()])

  function updateForm(field: keyof EventForm, val: any) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  function updateTicket(idx: number, field: keyof TicketForm, val: string) {
    setTickets((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: val } : t))
  }

  function addTicket() { setTickets((t) => [...t, defaultTicket()]) }
  function removeTicket(idx: number) {
    if (tickets.length <= 1) return
    setTickets((t) => t.filter((_, i) => i !== idx))
  }

  function validateStep(): boolean {
    if (step === 0) {
      if (!form.title.trim()) { toast.error('Judul event wajib diisi'); return false }
      if (!form.category) { toast.error('Pilih kategori event'); return false }
      if (!form.description.trim()) { toast.error('Deskripsi event wajib diisi'); return false }
    }
    if (step === 1) {
      if (!form.startDate) { toast.error('Tanggal mulai wajib diisi'); return false }
      if (!form.endDate) { toast.error('Tanggal selesai wajib diisi'); return false }
      if (!form.location.trim()) { toast.error('Lokasi wajib diisi'); return false }
    }
    if (step === 2) {
      for (const t of tickets) {
        if (!t.name.trim()) { toast.error('Nama tiket wajib diisi'); return false }
        if (Number(t.quota) < 1) { toast.error('Kuota tiket harus lebih dari 0'); return false }
        if (Number(t.maxPerOrder) < 1) { toast.error('Batas per transaksi minimal 1 tiket'); return false }
        if (Number(t.maxPerAccount) < 0) { toast.error('Batas per akun tidak boleh negatif'); return false }
        if (!t.saleStartDate || !t.saleEndDate) { toast.error('Tanggal penjualan tiket wajib diisi'); return false }
      }
    }
    return true
  }

  async function handleSubmit(publish: boolean) {
    if (!dbUser) return
    setSubmitting(true)
    try {
      const profiles = await api.get(`/eo-profiles?user_id=${dbUser.id}`)
      const profile = (profiles as EOProfile[])[0]
      if (!profile) { toast.error('Profil EO tidak ditemukan'); return }
      if (profile.status !== 'ACTIVE') {
        toast.error('Akun EO Anda belum diaktifkan. Tunggu persetujuan admin.')
        return
      }

      const eventId = crypto.randomUUID()
      const now = new Date().toISOString()
      await api.post('/events', {
        id: eventId, eoProfileId: profile.id, title: form.title.trim(),
        description: form.description.trim(), category: form.category,
        bannerImage: undefined,
        location: form.location.trim(), locationUrl: form.locationUrl.trim() || undefined,
        startDate: new Date(form.startDate).toISOString(), endDate: new Date(form.endDate).toISOString(),
        status: publish ? 'PUBLISHED' : 'DRAFT', 
        is_resale_allowed: form.isResaleAllowed,
        createdAt: now, updatedAt: now,
      })

      if (form.bannerFile) {
        const formData = new FormData()
        formData.append('banner', form.bannerFile)
        await api.upload(`/events/${eventId}/banner`, formData)
      }

      for (const tt of tickets) {
        await api.post('/ticket-types', {
          id: crypto.randomUUID(), eventId, name: tt.name.trim(),
          description: tt.description.trim() || undefined, price: Number(tt.price),
          quota: Number(tt.quota), sold: 0, maxPerOrder: Number(tt.maxPerOrder) || 5, maxPerAccount: Number(tt.maxPerAccount) || 0,
          saleStartDate: new Date(tt.saleStartDate).toISOString(),
          saleEndDate: new Date(tt.saleEndDate).toISOString(),
        })
      }

      toast.success(publish ? 'Event berhasil dipublikasikan!' : 'Event disimpan sebagai draft.')
      navigate({ to: '/eo/events' })
    } catch {
      toast.error('Gagal membuat event.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Buat Event Baru</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
          <StepIndicator current={step} />

          {/* Step 0 */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground">Informasi Dasar</h2>
              <div className="space-y-1.5"><Label>Judul Event *</Label><Input placeholder="Masukkan judul event" value={form.title} onChange={(e) => updateForm('title', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Kategori *</Label>
                <Select value={form.category} onValueChange={(v) => updateForm('category', v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Deskripsi *</Label><Textarea placeholder="Jelaskan tentang event Anda..." rows={4} value={form.description} onChange={(e) => updateForm('description', e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Gambar Banner (opsional)</Label>
                <div className="flex items-center gap-4 mt-1">
                  {form.bannerImage && (
                    <img src={form.bannerImage} alt="Preview" className="w-24 h-16 object-cover rounded-md border border-border" />
                  )}
                  <Input 
                    type="file" 
                    accept="image/jpeg, image/png, image/jpg" 
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        updateForm('bannerFile', file)
                        updateForm('bannerImage', URL.createObjectURL(file))
                      }
                    }} 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground">Jadwal & Lokasi</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Tanggal Mulai *</Label><Input type="datetime-local" value={form.startDate} onChange={(e) => updateForm('startDate', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Tanggal Selesai *</Label><Input type="datetime-local" value={form.endDate} onChange={(e) => updateForm('endDate', e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Nama Venue / Lokasi *</Label><Input placeholder="Contoh: Jakarta Convention Center" value={form.location} onChange={(e) => updateForm('location', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Link Google Maps (opsional)</Label><Input placeholder="https://maps.google.com/..." type="url" value={form.locationUrl} onChange={(e) => updateForm('locationUrl', e.target.value)} /></div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">Jenis Tiket</h2>
                <Button size="sm" variant="outline" onClick={addTicket}><Plus size={14} className="mr-1" /> Tambah Tiket</Button>
              </div>
              
              <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isResaleAllowed"
                    className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                    checked={form.isResaleAllowed}
                    onChange={(e) => updateForm('isResaleAllowed', e.target.checked)}
                  />
                  <Label htmlFor="isResaleAllowed" className="font-medium cursor-pointer">Izinkan pembeli menjual kembali tiket (Resale)</Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Jika diaktifkan, pembeli dapat mendaftarkan tiket mereka di marketplace resale platform ini. 
                  Default: tidak dicentang (resale tidak diizinkan).
                </p>
              </div>

              {tickets.map((tt, idx) => (
                <div key={idx} className="border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Tiket #{idx + 1}</span>
                    {tickets.length > 1 && <button onClick={() => removeTicket(idx)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={14} /></button>}
                  </div>
                  <div className="space-y-1.5"><Label>Nama Tiket *</Label><Input placeholder="Contoh: Regular, VIP" value={tt.name} onChange={(e) => updateTicket(idx, 'name', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Deskripsi</Label><Input placeholder="Fasilitas tiket ini..." value={tt.description} onChange={(e) => updateTicket(idx, 'description', e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Harga (Rp)</Label>
                      <Input type="number" min="0" placeholder="0" value={tt.price} onChange={(e) => updateTicket(idx, 'price', e.target.value)} />
                      <p className="text-[11px] text-muted-foreground">Masukkan 0 untuk tiket gratis</p>
                    </div>
                    <div className="space-y-1.5"><Label>Kuota</Label><Input type="number" min="1" placeholder="100" value={tt.quota} onChange={(e) => updateTicket(idx, 'quota', e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Batas per Transaksi</Label>
                      <Input type="number" min="1" placeholder="5" value={tt.maxPerOrder} onChange={(e) => updateTicket(idx, 'maxPerOrder', e.target.value)} />
                      <p className="text-[11px] text-muted-foreground">Maksimal tiket dalam satu pembelian</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Batas per Akun</Label>
                      <Input type="number" min="0" placeholder="0" value={tt.maxPerAccount} onChange={(e) => updateTicket(idx, 'maxPerAccount', e.target.value)} />
                      <p className="text-[11px] text-muted-foreground">Isi 0 jika tidak ingin membatasi</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Mulai Jual *</Label><Input type="datetime-local" value={tt.saleStartDate} onChange={(e) => updateTicket(idx, 'saleStartDate', e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Selesai Jual *</Label><Input type="datetime-local" value={tt.saleEndDate} onChange={(e) => updateTicket(idx, 'saleEndDate', e.target.value)} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground">Review & Publish</h2>
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Judul</span><span className="font-medium text-foreground text-right max-w-48 truncate">{form.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kategori</span><span className="font-medium text-foreground">{form.category}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Lokasi</span><span className="font-medium text-foreground text-right max-w-48 truncate">{form.location}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tanggal</span><span className="font-medium text-foreground">{form.startDate ? new Date(form.startDate).toLocaleDateString('id-ID') : '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Jenis Tiket</span><span className="font-medium text-foreground">{tickets.length} jenis</span></div>
              </div>
              <div className="flex flex-col gap-2.5 mt-2">
                <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={submitting} onClick={() => handleSubmit(true)}>
                  {submitting ? 'Mempublikasikan...' : 'Publikasikan Sekarang'}
                </Button>
                <Button variant="outline" className="w-full" disabled={submitting} onClick={() => handleSubmit(false)}>
                  {submitting ? 'Menyimpan...' : 'Simpan sebagai Draft'}
                </Button>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {step < 3 && (
            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>Kembali</Button>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => { if (validateStep()) setStep((s) => s + 1) }}>Lanjut</Button>
            </div>
          )}
          {step === 3 && (
            <div className="flex justify-start mt-4">
              <Button variant="outline" onClick={() => setStep(2)}>Kembali</Button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
