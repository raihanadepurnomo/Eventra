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
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing, mapTicketPricingPhase, mapCustomFormField } from '@/lib/mappers'
import type { Event, TicketType, CustomFormField } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'

const CATEGORIES = ['Konser', 'Seminar', 'Festival', 'Workshop', 'Exhibition', 'Sports', 'Lainnya']

function toDateTimeLocal(value?: string | null) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toIsoOrNull(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function optionsToDraftText(options?: string[]) {
  if (!Array.isArray(options) || options.length === 0) return ''
  return options.join(', ')
}

function parseOptionsDraftText(raw: string) {
  return String(raw || '')
    .split(',')
    .map((opt) => opt.trim())
    .filter(Boolean)
}

function toMillis(value: any) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function hasPhaseOverlap(a: any, b: any) {
  const aStart = toMillis(a.startDate)
  const aEnd = toMillis(a.endDate)
  const bStart = toMillis(b.startDate)
  const bEnd = toMillis(b.endDate)

  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false
  return aStart <= bEnd && bStart <= aEnd
}

function parseRequiredNumber(value: any, label: string) {
  if (value === '' || value === null || value === undefined) {
    throw new Error(`${label} wajib diisi.`)
  }

  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${label} tidak valid.`)
  }

  return n
}

function parseNonNegativeInt(value: any, label: string, { allowZero = true, defaultValue = 0 } = {}) {
  if (value === '' || value === null || value === undefined) {
    const fallback = Number(defaultValue)
    return Number.isFinite(fallback) ? Math.max(allowZero ? 0 : 1, Math.trunc(fallback)) : (allowZero ? 0 : 1)
  }

  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${label} tidak valid.`)
  }

  const normalized = Math.trunc(n)
  const min = allowZero ? 0 : 1
  if (normalized < min) {
    throw new Error(`${label} minimal ${min}.`)
  }

  return normalized
}

export default function EOEventDetailPage() {
  const { id } = useParams({ from: '/eo/events/$id' })
  const navigate = useNavigate()
  const [event, setEvent] = useState<Event | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [ticketPhases, setTicketPhases] = useState<Record<string, any[]>>({})
  const [customFormFields, setCustomFormFields] = useState<CustomFormField[]>([])
  const [customFieldOptionDrafts, setCustomFieldOptionDrafts] = useState<Record<string, string>>({})
  const [addingTicket, setAddingTicket] = useState(false)
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null)
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null)
  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const [rawEv, rawTts, rawPhases, rawCustomFields] = await Promise.all([
        api.get(`/events/${id}`),
        api.get(`/ticket-types?event_id=${id}`),
        api.get(`/ticket-pricing-phases?event_id=${id}`),
        api.get(`/events/${id}/custom-form-fields`),
      ])

      setEvent(mapEvent(rawEv as any))
      setTicketTypes((rawTts as any[]).map(mapTicketType))

      const grouped: Record<string, any[]> = {}
      for (const phaseRaw of (rawPhases as any[])) {
        const phase = mapTicketPricingPhase(phaseRaw)
        if (!grouped[phase.ticketTypeId]) grouped[phase.ticketTypeId] = []
        grouped[phase.ticketTypeId].push(phase)
      }
      setTicketPhases(grouped)

      const mappedCustomFields = (rawCustomFields as any[]).map(mapCustomFormField)
      setCustomFormFields(mappedCustomFields)
      setCustomFieldOptionDrafts(
        mappedCustomFields.reduce((acc, field) => {
          acc[field.id] = optionsToDraftText(field.options)
          return acc
        }, {} as Record<string, string>)
      )
    } finally {
      setLoading(false)
    }
  }

  function buildTicketPayload(tt: TicketType) {
    if (!String(tt.name || '').trim()) {
      throw new Error('Nama tiket wajib diisi.')
    }

    const price = parseRequiredNumber(tt.price, 'Harga tiket')
    if (price < 0) {
      throw new Error('Harga tiket tidak boleh negatif.')
    }

    const quota = parseNonNegativeInt(tt.quota, 'Kuota tiket', { allowZero: false, defaultValue: 100 })
    const maxPerOrder = parseNonNegativeInt(tt.maxPerOrder, 'Batas per transaksi', { allowZero: false, defaultValue: 5 })
    const maxPerAccount = parseNonNegativeInt(tt.maxPerAccount, 'Batas per akun', { allowZero: true, defaultValue: 0 })

    if (tt.isBundle) {
      const bundleQty = parseNonNegativeInt(tt.bundleQty, 'Jumlah tiket bundling', { allowZero: false, defaultValue: 2 })
      if (!Number.isInteger(bundleQty) || bundleQty < 2 || bundleQty > 10) {
        throw new Error('Jumlah tiket bundling harus 2 sampai 10.')
      }
    }

    return {
      name: tt.name,
      description: tt.description || undefined,
      price,
      quota,
      maxPerOrder,
      maxPerAccount,
      isBundle: Boolean(tt.isBundle),
      bundleQty: tt.isBundle
        ? parseNonNegativeInt(tt.bundleQty, 'Jumlah tiket bundling', { allowZero: false, defaultValue: 2 })
        : 1,
      saleStartDate: tt.saleStartDate,
      saleEndDate: tt.saleEndDate,
    }
  }

  function buildPhasePayload(ticketTypeId: string, phase: any, allPhases: any[]) {
    if (!String(phase.phaseName || '').trim()) {
      throw new Error('Nama fase wajib diisi.')
    }

    const price = parseRequiredNumber(phase.price, 'Harga fase')
    if (price < 0) {
      throw new Error('Harga fase tidak boleh negatif.')
    }

    const startIso = toIsoOrNull(phase.startDate)
    const endIso = toIsoOrNull(phase.endDate)
    if (!startIso || !endIso) {
      throw new Error('Tanggal mulai dan selesai fase wajib diisi.')
    }

    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      throw new Error('Tanggal mulai fase harus lebih awal dari tanggal selesai.')
    }

    const siblings = allPhases.filter((row) => row.id !== phase.id)
    const overlaps = siblings.some((row) => hasPhaseOverlap(
      { startDate: startIso, endDate: endIso },
      row
    ))
    if (overlaps) {
      throw new Error(`Rentang waktu fase bertabrakan pada tiket ${ticketTypeId}.`)
    }

    return {
      phaseName: String(phase.phaseName || '').trim(),
      price,
      quota: phase.quota === '' || phase.quota === undefined || phase.quota === null
        ? null
        : parseNonNegativeInt(phase.quota, 'Kuota fase', { allowZero: true, defaultValue: 0 }),
      startDate: startIso,
      endDate: endIso,
    }
  }

  async function handleSave() {
    if (!event) return
    setSaving(true)
    try {
      const ticketPlans = ticketTypes.map((tt) => ({
        ticketId: tt.id,
        payload: buildTicketPayload(tt),
      }))

      const phasePlans = ticketPlans.flatMap((plan) => {
        const phases = [...(ticketPhases[plan.ticketId] || [])].sort((a, b) => {
          const aMs = toMillis(a.startDate) ?? Number.MAX_SAFE_INTEGER
          const bMs = toMillis(b.startDate) ?? Number.MAX_SAFE_INTEGER
          return aMs - bMs
        })

        return phases.map((phase) => ({
          phaseId: phase.id,
          payload: buildPhasePayload(plan.ticketId, phase, phases),
        }))
      })

      const payloadBanner = bannerFile ? undefined : (event.bannerImage || undefined)
      await api.put(`/events/${id}`, { title: event.title, description: event.description, category: event.category, bannerImage: payloadBanner, location: event.location, locationUrl: event.locationUrl || undefined, startDate: event.startDate, endDate: event.endDate, is_resale_allowed: event.isResaleAllowed, updatedAt: new Date().toISOString() })
      
      if (bannerFile) {
        const formData = new FormData()
        formData.append('banner', bannerFile)
        await api.upload(`/events/${id}/banner`, formData)
      }

      const updatedTickets: TicketType[] = []
      for (const plan of ticketPlans) {
        const updatedRaw = await api.put(`/ticket-types/${plan.ticketId}`, plan.payload)
        updatedTickets.push(mapTicketType(updatedRaw as any))
      }

      setTicketTypes(updatedTickets)

      for (const plan of phasePlans) {
        await api.put(`/ticket-pricing-phases/${plan.phaseId}`, plan.payload)
      }

      await load()
      toast.success('Semua perubahan event, tiket, dan fase berhasil disimpan!')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan semua perubahan.')
    } finally { setSaving(false) }
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
    setAddingTicket(true)
    try {
      const newTT = await api.post('/ticket-types', {
        id: crypto.randomUUID(),
        eventId: id,
        name: 'Tiket Baru',
        description: undefined,
        price: 0,
        quota: 100,
        sold: 0,
        maxPerOrder: 5,
        maxPerAccount: 0,
        isBundle: false,
        bundleQty: 1,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      const mapped = mapTicketType(newTT as any)
      setTicketTypes((prev) => [...prev, mapped])
      setTicketPhases((prev) => ({ ...prev, [mapped.id]: [] }))
      toast.success('Jenis tiket ditambahkan.')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menambahkan jenis tiket.')
    } finally {
      setAddingTicket(false)
    }
  }

  async function handleSaveTicket(ticketTypeId: string) {
    const tt = ticketTypes.find((item) => item.id === ticketTypeId)
    if (!tt) {
      toast.error('Data tiket tidak ditemukan di editor.')
      return
    }

    setSavingTicketId(ticketTypeId)
    try {
      const payload = buildTicketPayload(tt)
      const updated = await api.put(`/ticket-types/${tt.id}`, payload)

      const mapped = mapTicketType(updated as any)
      setTicketTypes((prev) => prev.map((item) => (item.id === ticketTypeId ? mapped : item)))
      toast.success('Tiket disimpan.')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan jenis tiket.')
    } finally {
      setSavingTicketId(null)
    }
  }

  async function handleDeleteTicket(ttId: string) {
    const confirmed = window.confirm('Hapus jenis tiket ini? Aksi ini tidak dapat dibatalkan.')
    if (!confirmed) return

    setDeletingTicketId(ttId)
    try {
      await api.delete(`/ticket-types/${ttId}`)
      setTicketTypes((prev) => prev.filter((t) => t.id !== ttId))
      setTicketPhases((prev) => {
        const next = { ...prev }
        delete next[ttId]
        return next
      })
      toast.success('Tiket dihapus.')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus jenis tiket.')
    } finally {
      setDeletingTicketId(null)
    }
  }

  function handleUpdatePhaseField(ticketTypeId: string, phaseId: string, field: string, value: any) {
    setTicketPhases((prev) => ({
      ...prev,
      [ticketTypeId]: (prev[ticketTypeId] || []).map((phase) =>
        phase.id === phaseId ? { ...phase, [field]: value } : phase
      ),
    }))
  }

  async function handleAddPricingPhase(ticketTypeId: string) {
    try {
      const existing = ticketPhases[ticketTypeId] || []
      const maxEndMs = existing.reduce((max, phase) => {
        const endMs = toMillis(phase.endDate)
        return endMs !== null ? Math.max(max, endMs) : max
      }, Date.now())

      const startDate = new Date(maxEndMs + 60 * 1000)
      const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000)

      const created = await api.post('/ticket-pricing-phases', {
        ticketTypeId,
        phaseName: `Fase ${existing.length + 1}`,
        price: 0,
        quota: null,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })

      const mapped = mapTicketPricingPhase(created as any)
      setTicketPhases((prev) => ({
        ...prev,
        [ticketTypeId]: [...(prev[ticketTypeId] || []), mapped],
      }))
      toast.success('Fase harga ditambahkan.')
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menambah fase harga.')
    }
  }

  async function handleSavePricingPhase(ticketTypeId: string, phase: any) {
    try {
      const payload = buildPhasePayload(ticketTypeId, phase, ticketPhases[ticketTypeId] || [])
      await api.put(`/ticket-pricing-phases/${phase.id}`, payload)
      toast.success('Fase harga disimpan.')
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan fase harga.')
    }
  }

  async function handleDeletePricingPhase(ticketTypeId: string, phaseId: string) {
    try {
      await api.delete(`/ticket-pricing-phases/${phaseId}`)
      setTicketPhases((prev) => ({
        ...prev,
        [ticketTypeId]: (prev[ticketTypeId] || []).filter((phase) => phase.id !== phaseId),
      }))
      toast.success('Fase harga dihapus.')
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus fase harga.')
    }
  }

  function addCustomField() {
    if (customFormFields.length >= 10) {
      toast.error('Maksimal 10 pertanyaan per event.')
      return
    }

    const tempId = `tmp_${crypto.randomUUID()}`

    setCustomFormFields((prev) => [
      ...prev,
      {
        id: tempId,
        eventId: id,
        label: '',
        fieldType: 'text',
        options: [],
        isRequired: true,
        appliesTo: 'per_ticket',
        sortOrder: prev.length,
      },
    ])

    setCustomFieldOptionDrafts((prev) => ({
      ...prev,
      [tempId]: '',
    }))
  }

  function updateCustomField(fieldId: string, patch: Partial<CustomFormField>) {
    setCustomFormFields((prev) => prev.map((field) => field.id === fieldId ? { ...field, ...patch } : field))
  }

  async function saveCustomField(field: CustomFormField) {
    if (!field.label.trim()) {
      toast.error('Label pertanyaan wajib diisi.')
      return
    }

    const optionDraft = customFieldOptionDrafts[field.id] ?? optionsToDraftText(field.options)
    const normalizedOptions = (field.fieldType === 'select' || field.fieldType === 'radio')
      ? parseOptionsDraftText(optionDraft)
      : []

    if ((field.fieldType === 'select' || field.fieldType === 'radio') && normalizedOptions.length === 0) {
      toast.error('Field select/radio wajib memiliki opsi.')
      return
    }

    const payload = {
      label: field.label.trim(),
      fieldType: field.fieldType,
      options: normalizedOptions,
      isRequired: field.isRequired,
      appliesTo: field.appliesTo,
      sortOrder: Number(field.sortOrder || 0),
    }

    try {
      if (field.id.startsWith('tmp_')) {
        await api.post(`/events/${id}/custom-form-fields`, payload)
      } else {
        await api.put(`/events/${id}/custom-form-fields/${field.id}`, payload)
      }
      toast.success('Pertanyaan form peserta disimpan.')
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan pertanyaan.')
    }
  }

  async function removeCustomField(fieldId: string) {
    if (fieldId.startsWith('tmp_')) {
      setCustomFormFields((prev) => prev.filter((f) => f.id !== fieldId))
      setCustomFieldOptionDrafts((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
      return
    }

    try {
      await api.delete(`/events/${id}/custom-form-fields/${fieldId}`)
      toast.success('Pertanyaan dihapus.')
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus pertanyaan.')
    }
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
            <Button size="sm" variant="outline" onClick={() => navigate({ to: '/eo/events/$id/promos', params: { id } })}>
              Promo Code
            </Button>
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
              <Button type="button" size="sm" variant="outline" onClick={handleAddTicket} disabled={addingTicket}>
                <Plus size={13} className="mr-1" /> {addingTicket ? 'Menambah...' : 'Tambah'}
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pembeda Jenis & Fase Tiket</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Bundling</span>
                <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">Reguler</span>
                <span className="inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800">Fase ON</span>
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Fase OFF</span>
              </div>
            </div>
            {ticketTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada jenis tiket.</p>
            ) : (
              ticketTypes.map((tt) => (
                <TicketEditor
                  key={tt.id}
                  tt={tt}
                  phases={ticketPhases[tt.id] || []}
                  onChange={(updated) => setTicketTypes((prev) => prev.map((t) => t.id === tt.id ? updated : t))}
                  onSave={() => handleSaveTicket(tt.id)}
                  onDelete={() => handleDeleteTicket(tt.id)}
                  onAddPhase={() => handleAddPricingPhase(tt.id)}
                  onPhaseChange={(phaseId, field, value) => handleUpdatePhaseField(tt.id, phaseId, field, value)}
                  onSavePhase={(phase) => handleSavePricingPhase(tt.id, phase)}
                  onDeletePhase={(phaseId) => handleDeletePricingPhase(tt.id, phaseId)}
                  isSaving={savingTicketId === tt.id}
                  isDeleting={deletingTicketId === tt.id}
                />
              ))
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Form Peserta</h2>
                <p className="text-xs text-muted-foreground mt-1">Pertanyaan ini wajib diisi pembeli saat checkout. Maksimal 10 pertanyaan.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addCustomField} disabled={customFormFields.length >= 10}>
                <Plus size={13} className="mr-1" /> Tambah Pertanyaan
              </Button>
            </div>

            {customFormFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pertanyaan custom.</p>
            ) : (
              <div className="space-y-3">
                {customFormFields.map((field, idx) => (
                  <div key={field.id} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">Pertanyaan {idx + 1}</p>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => removeCustomField(field.id)}>
                        Hapus
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Label</Label>
                      <Input value={field.label} onChange={(e) => updateCustomField(field.id, { label: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tipe</Label>
                        <Select value={field.fieldType} onValueChange={(v) => {
                          const nextType = v as CustomFormField['fieldType']

                          if (nextType === 'select' || nextType === 'radio') {
                            const draft = customFieldOptionDrafts[field.id] ?? optionsToDraftText(field.options)
                            setCustomFieldOptionDrafts((prev) => ({ ...prev, [field.id]: draft }))
                            updateCustomField(field.id, { fieldType: nextType, options: parseOptionsDraftText(draft) })
                          } else {
                            setCustomFieldOptionDrafts((prev) => ({ ...prev, [field.id]: '' }))
                            updateCustomField(field.id, { fieldType: nextType, options: [] })
                          }
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="select">Pilihan (Select)</SelectItem>
                            <SelectItem value="radio">Pilihan (Radio)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Berlaku</Label>
                        <Select value={field.appliesTo} onValueChange={(v) => updateCustomField(field.id, { appliesTo: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="per_ticket">Per Tiket</SelectItem>
                            <SelectItem value="order">Per Order</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(field.fieldType === 'select' || field.fieldType === 'radio') && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Opsi (pisahkan dengan koma)</Label>
                        <Input
                          value={customFieldOptionDrafts[field.id] ?? optionsToDraftText(field.options)}
                          onChange={(e) => {
                            const raw = e.target.value
                            setCustomFieldOptionDrafts((prev) => ({ ...prev, [field.id]: raw }))
                            updateCustomField(field.id, { options: parseOptionsDraftText(raw) })
                          }}
                          placeholder="S, M, L, XL"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                          checked={field.isRequired}
                          onChange={(e) => updateCustomField(field.id, { isRequired: e.target.checked })}
                        />
                        Wajib diisi
                      </label>

                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveCustomField(field)}>
                        Simpan Pertanyaan
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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

function TicketEditor({
  tt,
  phases,
  onChange,
  onSave,
  onDelete,
  onAddPhase,
  onPhaseChange,
  onSavePhase,
  onDeletePhase,
  isSaving,
  isDeleting,
}: {
  tt: TicketType
  phases: any[]
  onChange: (t: TicketType) => void
  onSave: () => void
  onDelete: () => void
  onAddPhase: () => void
  onPhaseChange: (phaseId: string, field: string, value: any) => void
  onSavePhase: (phase: any) => void
  onDeletePhase: (phaseId: string) => void
  isSaving: boolean
  isDeleting: boolean
}) {
  const upd = (field: keyof TicketType, val: string | number | boolean) => onChange({ ...tt, [field]: val })
  const disablePrimaryActions = isSaving || isDeleting
  const normalizedBundleQty = Math.max(2, Number(tt.bundleQty || 2))
  const phaseEnabled = phases.length > 0
  const setBundleMode = (checked: boolean) => {
    onChange({
      ...tt,
      isBundle: checked,
      bundleQty: checked ? normalizedBundleQty : 1,
    })
  }

  const ticketToneClass = tt.isBundle
    ? 'border-emerald-300 bg-emerald-50/35'
    : 'border-sky-300 bg-sky-50/25'
  const phaseToneClass = tt.isBundle
    ? 'border-emerald-200 bg-emerald-50/45'
    : 'border-slate-200 bg-slate-50/70'

  return (
    <div className={cn('border rounded-lg p-3 space-y-2.5 text-sm transition-colors', ticketToneClass)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input className="h-7 text-xs font-medium w-48" value={tt.name} onChange={(e) => upd('name', e.target.value)} placeholder="Nama tiket" />
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', tt.isBundle ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-sky-300 bg-sky-100 text-sky-800')}>
            {tt.isBundle ? 'Bundling' : 'Reguler'}
          </span>
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', phaseEnabled ? 'border-violet-300 bg-violet-100 text-violet-800' : 'border-slate-300 bg-slate-100 text-slate-700')}>
            {phaseEnabled ? 'Fase ON' : 'Fase OFF'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSave} disabled={disablePrimaryActions}>
            <Save size={12} className="mr-1" /> {isSaving ? 'Menyimpan...' : 'Simpan'}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={onDelete} disabled={disablePrimaryActions}>
            <Trash2 size={12} className="mr-1" /> {isDeleting ? 'Menghapus...' : 'Hapus'}
          </Button>
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

      <div className={cn('rounded-md border p-2.5 space-y-2', tt.isBundle ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/70')}>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            checked={Boolean(tt.isBundle)}
            onChange={(e) => setBundleMode(e.target.checked)}
          />
          Ini adalah tiket bundling
        </label>

        {tt.isBundle && (
          <div className="space-y-1 pl-6">
            <Label className="text-xs">Jumlah tiket dalam 1 paket</Label>
            <Input
              type="number"
              min="2"
              max="10"
              className="h-7 text-xs mt-1"
              value={normalizedBundleQty}
              onChange={(e) => {
                const parsed = Number(e.target.value)
                const next = Number.isFinite(parsed)
                  ? Math.max(2, Math.min(10, Math.trunc(parsed)))
                  : 2
                upd('bundleQty', next)
              }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Pembeli yang beli 1 paket akan mendapat 1 QR code untuk {normalizedBundleQty} peserta.</p>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3 mt-1 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Pricing Bertingkat (Early Bird / Flash Sale)</p>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onAddPhase}>
            <Plus size={12} className="mr-1" /> Tambah Fase
          </Button>
        </div>

        <div className={cn('rounded-md border p-2.5 space-y-1.5', tt.isBundle ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/70')}>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-not-allowed"
              checked={Boolean(tt.isBundle)}
              disabled
            />
            Fase ini untuk tiket bundling (indikator)
          </label>
          <p className="text-[11px] text-muted-foreground">
            {tt.isBundle
              ? `Harga/kuota fase dihitung per paket (1 paket = ${normalizedBundleQty} peserta).`
              : 'Harga/kuota fase dihitung per tiket reguler.'}
          </p>
          <p className="text-[11px] text-muted-foreground">Ubah status bundling dari checkbox "Ini adalah tiket bundling" di atas.</p>
        </div>

        {phases.length === 0 ? (
          <p className="text-xs text-muted-foreground">Belum ada fase harga. Klik Tambah Fase untuk membuat Early Bird.</p>
        ) : (
          [...phases]
            .sort((a, b) => {
              const aMs = toMillis(a.startDate) ?? Number.MAX_SAFE_INTEGER
              const bMs = toMillis(b.startDate) ?? Number.MAX_SAFE_INTEGER
              return aMs - bMs
            })
            .map((phase, idx) => (
              <div key={phase.id} className={cn('rounded-md border p-2.5 space-y-2', phaseToneClass)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-foreground">Fase {idx + 1}</p>
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', tt.isBundle ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-sky-300 bg-sky-100 text-sky-800')}>
                      {tt.isBundle ? 'Bundle' : 'Reguler'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onSavePhase(phase)}>
                      <Save size={11} className="mr-1" /> Simpan
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive" onClick={() => onDeletePhase(phase.id)}>
                      <Trash2 size={11} className="mr-1" /> Hapus
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Nama Fase</Label>
                    <Input className="h-7 text-xs mt-1" value={phase.phaseName || ''} onChange={(e) => onPhaseChange(phase.id, 'phaseName', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Harga {tt.isBundle ? 'per Paket' : 'per Tiket'}</Label>
                    <Input type="number" min="0" className="h-7 text-xs mt-1" value={phase.price ?? 0} onChange={(e) => onPhaseChange(phase.id, 'price', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Kuota Fase ({tt.isBundle ? 'paket' : 'tiket'}) (opsional)</Label>
                    <Input type="number" min="0" className="h-7 text-xs mt-1" value={phase.quota ?? ''} onChange={(e) => onPhaseChange(phase.id, 'quota', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Mulai *</Label>
                    <Input type="datetime-local" className="h-7 text-xs mt-1" value={toDateTimeLocal(phase.startDate)} onChange={(e) => onPhaseChange(phase.id, 'startDate', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Selesai *</Label>
                    <Input type="datetime-local" className="h-7 text-xs mt-1" value={toDateTimeLocal(phase.endDate)} onChange={(e) => onPhaseChange(phase.id, 'endDate', e.target.value)} />
                  </div>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
