// @ts-nocheck
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { Save, Trash2, Globe, EyeOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Label } from '@/components/ui/Label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing } from '@/lib/mappers'
import type { Event, TicketType } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'

const CATEGORIES = ['Konser', 'Seminar', 'Festival', 'Workshop', 'Exhibition', 'Sports', 'Lainnya']

export default function EOEventDetailPage() {
  const { id } = useParams({ from: '/eo/events/$id' })
  const navigate = useNavigate()
  const [event, setEvent] = useState<Event | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const rawEv = await api.get(`/events/${id}`)
      setEvent(mapEvent(rawEv as any))
      const rawTts = await api.get(`/ticket-types?event_id=${id}`)
      setTicketTypes((rawTts as any[]).map(mapTicketType))
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!event) return
    setSaving(true)
    try {
      const payloadBanner = bannerFile ? undefined : (event.bannerImage || undefined)
      await api.put(`/events/${id}`, { title: event.title, description: event.description, category: event.category, bannerImage: payloadBanner, location: event.location, locationUrl: event.locationUrl || undefined, startDate: event.startDate, endDate: event.endDate, is_resale_allowed: event.isResaleAllowed, updatedAt: new Date().toISOString() })
      
      if (bannerFile) {
        const formData = new FormData()
        formData.append('banner', bannerFile)
        await api.upload(`/events/${id}/banner`, formData)
      }

      toast.success('Event berhasil disimpan!')
    } catch { toast.error('Gagal menyimpan.') } finally { setSaving(false) }
  }

  async function handlePublish() {
    await api.put(`/events/${id}`, { status: 'PUBLISHED', updatedAt: new Date().toISOString() })
    setEvent((e) => e ? { ...e, status: 'PUBLISHED' } : e)
    toast.success('Event dipublikasikan!')
  }

  async function handleUnpublish() {
    await api.put(`/events/${id}`, { status: 'DRAFT', updatedAt: new Date().toISOString() })
    setEvent((e) => e ? { ...e, status: 'DRAFT' } : e)
    toast.success('Event dikembalikan ke draft.')
  }

  async function handleDelete() {
    await api.put(`/events/${id}`, { status: 'CANCELLED', updatedAt: new Date().toISOString() })
    toast.success('Event dibatalkan.')
    navigate({ to: '/eo/events' })
  }

  async function handleAddTicket() {
    const newTT = await api.post('/ticket-types', { id: crypto.randomUUID(), eventId: id, name: 'Tiket Baru', description: undefined, price: 0, quota: 100, sold: 0, maxPerOrder: 5, maxPerAccount: 0, saleStartDate: new Date().toISOString(), saleEndDate: new Date(Date.now() + 7 * 86400000).toISOString() })
    setTicketTypes((prev) => [...prev, mapTicketType(newTT as any)])
    toast.success('Jenis tiket ditambahkan.')
  }

  async function handleSaveTicket(tt: TicketType) {
    await api.put(`/ticket-types/${tt.id}`, { name: tt.name, description: tt.description || undefined, price: Number(tt.price), quota: Number(tt.quota), maxPerOrder: Number(tt.maxPerOrder), maxPerAccount: Number(tt.maxPerAccount) || 0, saleStartDate: tt.saleStartDate, saleEndDate: tt.saleEndDate })
    toast.success('Tiket disimpan.')
  }

  async function handleDeleteTicket(ttId: string) {
    await api.delete(`/ticket-types/${ttId}`)
    setTicketTypes((prev) => prev.filter((t) => t.id !== ttId))
    toast.success('Tiket dihapus.')
  }

  if (loading) return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 p-6"><Skeleton className="h-64 rounded-xl" /></div>
    </div>
  )

  if (!event) return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex items-center justify-center"><p className="text-muted-foreground">Event tidak ditemukan.</p></div>
    </div>
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-foreground truncate max-w-64">{event.title}</h1>
            <StatusBadge status={event.status} />
          </div>
          <div className="flex items-center gap-2">
            {event.status === 'DRAFT' && (
              <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300" onClick={handlePublish}>
                <Globe size={13} className="mr-1" /> Publikasikan
              </Button>
            )}
            {event.status === 'PUBLISHED' && (
              <Button size="sm" variant="outline" onClick={handleUnpublish}><EyeOff size={13} className="mr-1" /> Unpublish</Button>
            )}
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleSave} disabled={saving}>
              <Save size={13} className="mr-1" /> {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
            {event.status === 'DRAFT' && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-6">
          {/* Event details */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Detail Event</h2>
            <div className="space-y-1.5"><Label>Judul</Label><Input value={event.title} onChange={(e) => setEvent((ev) => ev ? { ...ev, title: e.target.value } : ev)} /></div>
            <div className="space-y-1.5"><Label>Kategori</Label>
              <Select value={event.category} onValueChange={(v) => setEvent((ev) => ev ? { ...ev, category: v } : ev)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Deskripsi</Label><Textarea rows={3} value={event.description} onChange={(e) => setEvent((ev) => ev ? { ...ev, description: e.target.value } : ev)} /></div>
            <div className="space-y-1.5">
              <Label>Banner Event</Label>
              <div className="flex items-center gap-4">
                {event.bannerImage && (
                  <img src={event.bannerImage} alt="Banner" className="w-16 h-16 rounded-lg object-cover border border-border ring-1 ring-border/50" />
                )}
                <Input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setBannerFile(file)
                    setEvent((ev) => ev ? { ...ev, bannerImage: URL.createObjectURL(file) } : ev)
                  }
                }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Tanggal Mulai</Label><Input type="datetime-local" value={event.startDate.slice(0, 16)} onChange={(e) => setEvent((ev) => ev ? { ...ev, startDate: new Date(e.target.value).toISOString() } : ev)} /></div>
              <div className="space-y-1.5"><Label>Tanggal Selesai</Label><Input type="datetime-local" value={event.endDate.slice(0, 16)} onChange={(e) => setEvent((ev) => ev ? { ...ev, endDate: new Date(e.target.value).toISOString() } : ev)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Lokasi</Label><Input value={event.location} onChange={(e) => setEvent((ev) => ev ? { ...ev, location: e.target.value } : ev)} /></div>

            {/* Resale Toggle */}
            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-2 mt-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isResaleAllowed"
                  className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                  checked={!!event.isResaleAllowed}
                  onChange={(e) => setEvent((ev) => ev ? { ...ev, isResaleAllowed: e.target.checked } : ev)}
                />
                <Label htmlFor="isResaleAllowed" className="font-medium cursor-pointer">Izinkan pembeli menjual kembali tiket (Resale)</Label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Jika diaktifkan, pembeli dapat mendaftarkan tiket mereka di marketplace resale platform ini. 
                Sistem akan memvalidasi pengaturan ini saat tiket diresale.
              </p>
            </div>
          </div>

          {/* Ticket types */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Jenis Tiket</h2>
              <Button size="sm" variant="outline" onClick={handleAddTicket}><Plus size={13} className="mr-1" /> Tambah</Button>
            </div>
            {ticketTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada jenis tiket.</p>
            ) : (
              ticketTypes.map((tt) => (
                <TicketEditor key={tt.id} tt={tt} onChange={(updated) => setTicketTypes((prev) => prev.map((t) => t.id === tt.id ? updated : t))} onSave={() => handleSaveTicket(tt)} onDelete={() => handleDeleteTicket(tt.id)} />
              ))
            )}
          </div>
        </main>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Batalkan Event?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Event akan ditandai sebagai CANCELLED dan tidak dapat dipulihkan.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete}>Ya, Batalkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TicketEditor({ tt, onChange, onSave, onDelete }: { tt: TicketType; onChange: (t: TicketType) => void; onSave: () => void; onDelete: () => void }) {
  const upd = (field: keyof TicketType, val: string | number) => onChange({ ...tt, [field]: val })
  return (
    <div className="border border-border rounded-lg p-3 space-y-2.5 text-sm">
      <div className="flex items-center justify-between">
        <Input className="h-7 text-xs font-medium w-48" value={tt.name} onChange={(e) => upd('name', e.target.value)} placeholder="Nama tiket" />
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSave}><Save size={12} /></Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={onDelete}><Trash2 size={12} /></Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Harga</Label>
          <Input type="number" min="0" className="h-7 text-xs mt-1" value={tt.price} onChange={(e) => upd('price', e.target.value)} />
          <p className="text-[10px] text-muted-foreground mt-1">0 = tiket gratis</p>
        </div>
        <div><Label className="text-xs">Kuota</Label><Input type="number" className="h-7 text-xs mt-1" value={tt.quota} onChange={(e) => upd('quota', e.target.value)} /></div>
        <div><Label className="text-xs">Terjual</Label><Input type="number" className="h-7 text-xs mt-1" value={tt.sold} disabled /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Batas per Transaksi</Label>
          <Input type="number" min="1" className="h-7 text-xs mt-1" value={tt.maxPerOrder} onChange={(e) => upd('maxPerOrder', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Batas per Akun</Label>
          <Input type="number" min="0" className="h-7 text-xs mt-1" value={tt.maxPerAccount} onChange={(e) => upd('maxPerAccount', e.target.value)} />
        </div>
      </div>
    </div>
  )
}
