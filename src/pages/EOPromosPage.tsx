// @ts-nocheck
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Plus, Pencil, Power, TicketPercent } from 'lucide-react'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { mapPromoCode, mapTicketType } from '@/lib/mappers'
import { formatIDR } from '@/lib/utils'

function PromoFormModal({ open, onOpenChange, onSubmit, initial, ticketTypes }) {
  const [form, setForm] = useState<any>({
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: 10,
    minPurchase: 0,
    maxDiscount: '',
    quota: '',
    maxPerUser: 1,
    appliesToMode: 'all',
    appliesToTicketIds: [] as string[],
    startDate: '',
    endDate: '',
    isActive: true,
  })

  useEffect(() => {
    if (!initial) {
      setForm({
        code: '',
        description: '',
        discountType: 'percentage',
        discountValue: 10,
        minPurchase: 0,
        maxDiscount: '',
        quota: '',
        maxPerUser: 1,
        appliesToMode: 'all',
        appliesToTicketIds: [],
        startDate: '',
        endDate: '',
        isActive: true,
      })
      return
    }

    setForm({
      id: initial.id,
      code: initial.code,
      description: initial.description || '',
      discountType: initial.discountType,
      discountValue: initial.discountValue,
      minPurchase: initial.minPurchase,
      maxDiscount: initial.maxDiscount ?? '',
      quota: initial.quota ?? '',
      maxPerUser: initial.maxPerUser,
      appliesToMode: initial.appliesTo?.length ? 'specific' : 'all',
      appliesToTicketIds: initial.appliesTo || [],
      startDate: initial.startDate ? String(initial.startDate).slice(0, 16) : '',
      endDate: initial.endDate ? String(initial.endDate).slice(0, 16) : '',
      isActive: initial.isActive,
    })
  }, [initial, open])

  const canSubmit = useMemo(() => {
    return /^[A-Z0-9]+$/.test(String(form.code || '').trim()) && Number(form.discountValue) > 0
  }, [form.code, form.discountValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Promo Code' : 'Buat Promo Code'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 col-span-2">
            <Label>Kode Promo</Label>
            <Input value={form.code} onChange={(e) => setForm((prev: any) => ({ ...prev, code: e.target.value.toUpperCase().replace(/\s+/g, '') }))} placeholder="EARLYBIRD" />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label>Deskripsi</Label>
            <Input value={form.description} onChange={(e) => setForm((prev: any) => ({ ...prev, description: e.target.value }))} placeholder="Diskon 20% pembelian awal" />
          </div>

          <div className="space-y-1.5">
            <Label>Tipe Diskon</Label>
            <Select value={form.discountType} onValueChange={(v) => setForm((prev: any) => ({ ...prev, discountType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Persentase</SelectItem>
                <SelectItem value="flat">Nominal (Rp)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Nilai</Label>
            <Input type="number" min="1" value={form.discountValue} onChange={(e) => setForm((prev: any) => ({ ...prev, discountValue: Number(e.target.value || 0) }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Maks Potongan (opsional)</Label>
            <Input type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm((prev: any) => ({ ...prev, maxDiscount: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Min Pembelian</Label>
            <Input type="number" min="0" value={form.minPurchase} onChange={(e) => setForm((prev: any) => ({ ...prev, minPurchase: Number(e.target.value || 0) }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Kuota (kosong = unlimited)</Label>
            <Input type="number" min="0" value={form.quota} onChange={(e) => setForm((prev: any) => ({ ...prev, quota: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Maks per Akun</Label>
            <Input type="number" min="1" value={form.maxPerUser} onChange={(e) => setForm((prev: any) => ({ ...prev, maxPerUser: Number(e.target.value || 1) }))} />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label>Berlaku Untuk</Label>
            <Select value={form.appliesToMode} onValueChange={(v) => setForm((prev: any) => ({ ...prev, appliesToMode: v, appliesToTicketIds: v === 'all' ? [] : prev.appliesToTicketIds }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tiket</SelectItem>
                <SelectItem value="specific">Tiket tertentu</SelectItem>
              </SelectContent>
            </Select>
            {form.appliesToMode === 'specific' && (
              <div className="flex flex-wrap gap-2 pt-1">
                {ticketTypes.map((tt: any) => {
                  const checked = form.appliesToTicketIds.includes(tt.id)
                  return (
                    <button
                      key={tt.id}
                      type="button"
                      onClick={() => {
                        setForm((prev: any) => ({
                          ...prev,
                          appliesToTicketIds: checked
                            ? prev.appliesToTicketIds.filter((id: string) => id !== tt.id)
                            : [...prev.appliesToTicketIds, tt.id],
                        }))
                      }}
                      className={`px-2 py-1 rounded text-xs border ${checked ? 'bg-accent text-accent-foreground border-accent' : 'bg-background border-border text-muted-foreground'}`}
                    >
                      {tt.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Mulai</Label>
            <Input type="datetime-local" value={form.startDate} onChange={(e) => setForm((prev: any) => ({ ...prev, startDate: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Selesai</Label>
            <Input type="datetime-local" value={form.endDate} onChange={(e) => setForm((prev: any) => ({ ...prev, endDate: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            onClick={() => onSubmit(form)}
            disabled={!canSubmit}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EOPromosPage() {
  const { id: eventId } = useParams({ from: '/eo/events/$id/promos' })
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [promos, setPromos] = useState<any[]>([])
  const [ticketTypes, setTicketTypes] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<any | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [promoRaw, ttRaw] = await Promise.all([
        api.get<any[]>(`/eo/events/${eventId}/promos`),
        api.get<any[]>(`/ticket-types?event_id=${eventId}`),
      ])

      setPromos((promoRaw || []).map(mapPromoCode))
      setTicketTypes((ttRaw || []).map(mapTicketType))
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat promo')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [eventId])

  async function savePromo(form: any) {
    try {
      const payload = {
        code: String(form.code || '').toUpperCase(),
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue || 0),
        minPurchase: Number(form.minPurchase || 0),
        maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
        quota: form.quota === '' ? null : Number(form.quota),
        maxPerUser: Number(form.maxPerUser || 1),
        appliesTo: form.appliesToMode === 'specific' ? form.appliesToTicketIds : null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        isActive: form.isActive,
      }

      if (editingPromo?.id) {
        await api.put(`/eo/events/${eventId}/promos/${editingPromo.id}`, payload)
      } else {
        await api.post(`/eo/events/${eventId}/promos`, payload)
      }

      toast.success('Promo code berhasil disimpan')
      setModalOpen(false)
      setEditingPromo(null)
      await loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan promo code')
    }
  }

  async function disablePromo(promoId: string) {
    try {
      await api.delete(`/eo/events/${eventId}/promos/${promoId}`)
      toast.success('Promo dinonaktifkan')
      await loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menonaktifkan promo')
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <div className="flex items-center gap-2">
            <TicketPercent size={16} className="text-accent" />
            <h1 className="text-sm font-semibold text-foreground">Promo Code Event</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: '/eo/events/$id', params: { id: eventId } })}>Kembali ke Event</Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => { setEditingPromo(null); setModalOpen(true) }}>
              <Plus size={13} className="mr-1" /> Buat Kode
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ) : promos.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl bg-card">
              <p className="text-sm font-semibold text-foreground mb-1">Belum ada promo code</p>
              <p className="text-xs text-muted-foreground">Buat promo pertama untuk event ini.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left">Kode</th>
                    <th className="px-4 py-3 text-left">Diskon</th>
                    <th className="px-4 py-3 text-left">Terpakai</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((promo) => {
                    const usageLabel = promo.quota ? `${promo.usedCount}/${promo.quota}` : `${promo.usedCount}/∞`
                    const discountLabel = promo.discountType === 'percentage'
                      ? `${promo.discountValue}%`
                      : formatIDR(promo.discountValue)

                    return (
                      <tr key={promo.id} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 font-semibold">{promo.code}</td>
                        <td className="px-4 py-3">{discountLabel}</td>
                        <td className="px-4 py-3">{usageLabel}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${promo.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                            {promo.isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => { setEditingPromo(promo); setModalOpen(true) }}>
                              <Pencil size={12} className="mr-1" /> Edit
                            </Button>
                            {promo.isActive && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => disablePromo(promo.id)}>
                                <Power size={12} className="mr-1" /> Nonaktifkan
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      <PromoFormModal
        open={modalOpen}
        onOpenChange={(open: boolean) => {
          setModalOpen(open)
          if (!open) setEditingPromo(null)
        }}
        onSubmit={savePromo}
        initial={editingPromo}
        ticketTypes={ticketTypes}
      />
    </div>
  )
}
