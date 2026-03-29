import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import { ArrowLeft, Info, HelpCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Textarea } from '@/components/ui/Textarea'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { api } from '@/lib/api'
import { mapTicket, mapTicketType, mapEvent } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR } from '@/lib/utils'
import type { Ticket, TicketType, Event } from '@/types'

type SellableTicketOption = {
  id: string
  attendeeName: string
  attendeeEmail?: string
  attendeePhone?: string
}

export default function ResaleSellTicketPage() {
  const { ticketId } = useParams({ from: '/dashboard/tickets/$ticketId/sell' })
  const navigate = useNavigate()
  const { dbUser } = useAuth()
  
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [ticketType, setTicketType] = useState<TicketType | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [sellableTickets, setSellableTickets] = useState<SellableTicketOption[]>([])
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  
  const [askingPrice, setAskingPrice] = useState<number>(0)
  const [note, setNote] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function getPrimaryAttendee(ticketRow: Ticket): { name?: string; email?: string; phone?: string } {
    if (!Array.isArray(ticketRow.attendeeDetails)) {
      return {}
    }
    const first = ticketRow.attendeeDetails[0]
    if (!first || typeof first !== 'object') {
      return {}
    }
    return {
      name: String((first as any).name || ''),
      email: String((first as any).email || ''),
      phone: String((first as any).phone || ''),
    }
  }

  useEffect(() => {
    loadData()
  }, [ticketId])

  async function loadData() {
    setLoading(true)
    try {
      const rawTicket: any = await api.get(`/tickets/${ticketId}`)
      const t = mapTicket(rawTicket)
      setTicket(t)

      if (String(t.orderId || '').startsWith('rord_')) {
        toast.error('Tiket hasil pembelian resale tidak dapat dijual kembali.')
        navigate({ to: '/dashboard' })
        return
      }

      const rawTT: any = await api.get(`/ticket-types/${t.ticketTypeId}`)
      const tt = mapTicketType(rawTT)

      if (Number(t.bundleTotal || 1) > 1 || tt.isBundle) {
        toast.error('Tiket bundling tidak dapat dijual kembali.')
        navigate({ to: '/dashboard' })
        return
      }

      setTicketType(tt)
      setAskingPrice(tt.price) // Default to original price

      const rawEv: any = await api.get(`/events/${tt.eventId}`)
      setEvent(mapEvent(rawEv))

      const rawSameOrderTickets: any[] = await api.get(`/tickets?user_id=${t.userId}&order_id=${t.orderId}`)
      const sameOrderTickets = Array.isArray(rawSameOrderTickets)
        ? rawSameOrderTickets.map(mapTicket)
        : []

      const options: SellableTicketOption[] = sameOrderTickets
        .filter((item) => {
          const active = item.status === 'ACTIVE' && !item.isUsed
          const nonBundle = Number(item.bundleTotal || 1) <= 1
          const notResaleOrigin = !String(item.orderId || '').startsWith('rord_')
          return active && nonBundle && notResaleOrigin && item.ticketTypeId === t.ticketTypeId
        })
        .map((item) => {
          const attendee = getPrimaryAttendee(item)
          return {
            id: item.id,
            attendeeName: attendee.name || `Pemilik tiket ${item.id.slice(0, 8).toUpperCase()}`,
            attendeeEmail: attendee.email || undefined,
            attendeePhone: attendee.phone || undefined,
          }
        })

      if (options.length === 0) {
        toast.error('Tidak ada tiket aktif yang bisa dijual untuk transaksi ini.')
        navigate({ to: '/dashboard' })
        return
      }

      setSellableTickets(options)
      if (options.some((opt) => opt.id === t.id)) {
        setSelectedTicketIds([t.id])
      } else {
        setSelectedTicketIds([options[0].id])
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat data tiket')
      navigate({ to: '/dashboard' })
    } finally {
      setLoading(false)
    }
  }

  const originalPrice = ticketType?.price || 0
  const maxAllowedPrice = Math.round(originalPrice * 1.2)
  const minAllowedPrice = Math.round(originalPrice * 0.5)
  const platformFee = Math.round(askingPrice * 0.05)
  const sellerReceives = askingPrice - platformFee
  const selectedCount = selectedTicketIds.length
  const totalListingPrice = askingPrice * selectedCount
  const totalPlatformFee = platformFee * selectedCount
  const totalSellerReceives = sellerReceives * selectedCount

  function promptVerifyEmail() {
    if (!dbUser?.email) {
      toast.error('Harap login terlebih dahulu')
      navigate({ to: '/login' })
      return
    }

    toast.action({
      message: 'Harap verifikasi email terlebih dahulu. Lanjut ke halaman verifikasi?',
      confirmLabel: 'Ya, verifikasi',
      cancelLabel: 'Tidak',
      onConfirm: () => {
        const q = new URLSearchParams({ email: dbUser.email, type: 'verify_email', from: 'profile' })
        window.location.href = `/verify-otp?${q.toString()}`
      },
    })
  }

  function toggleTicketSelection(id: string) {
    setSelectedTicketIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((ticketId) => ticketId !== id)
      }
      return [...prev, id]
    })
  }

  function selectAllTickets() {
    setSelectedTicketIds(sellableTickets.map((item) => item.id))
  }

  function selectOnlyCurrentTicket() {
    if (!ticket?.id) return
    setSelectedTicketIds([ticket.id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dbUser?.isEmailVerified) {
      promptVerifyEmail()
      return
    }
    if (!agree) {
      toast.error('Anda harus menyetujui syarat & ketentuan')
      return
    }
    if (askingPrice > maxAllowedPrice) {
      toast.error(`Harga maksimal adalah ${formatIDR(maxAllowedPrice)}`)
      return
    }
    if (askingPrice < minAllowedPrice) {
      toast.error(`Harga minimal adalah ${formatIDR(minAllowedPrice)}`)
      return
    }
    if (selectedTicketIds.length === 0) {
      toast.error('Pilih minimal satu tiket yang ingin dijual.')
      return
    }

    setSubmitting(true)
    try {
      const results = await Promise.allSettled(
        selectedTicketIds.map((id) => api.post('/resale/listings', {
          ticketId: id,
          askingPrice,
          note,
        }))
      )

      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failed = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[]

      if (successCount <= 0) {
        const firstError = failed[0]?.reason?.message || 'Gagal mendaftarkan tiket'
        throw new Error(firstError)
      }

      if (failed.length > 0) {
        toast.success(`${successCount} tiket berhasil didaftarkan. ${failed.length} tiket gagal diproses.`)
      } else {
        toast.success(`${successCount} tiket berhasil didaftarkan untuk dijual!`)
      }

      navigate({ to: '/dashboard/resale' })
    } catch (err: any) {
      toast.error(err.message || 'Gagal mendaftarkan tiket')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 pt-20 pb-12">
        <div className="max-w-xl mx-auto px-4">
          <Link 
            to="/dashboard" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft size={16} /> Kembali ke Dashboard
          </Link>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border bg-muted/30">
              <h1 className="text-xl font-bold text-foreground">Jual Tiket Resmi</h1>
              <p className="text-sm text-muted-foreground mt-1">Daftarkan tiketmu untuk dibeli peserta lain dengan aman.</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">
              {/* Ticket Info Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider">
                  <div className="w-1.5 h-4 bg-accent rounded-full" />
                  Info Tiket
                </div>
                <div className="p-4 rounded-xl bg-muted/20 border border-border/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Event</span>
                    <span className="font-semibold text-foreground text-right">{event?.title}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Jenis Tiket</span>
                    <span className="text-foreground">{ticketType?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border/50 mt-2">
                    <span className="text-muted-foreground">Harga Asli</span>
                    <span className="font-mono font-bold text-foreground">{formatIDR(originalPrice)}</span>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider">
                  <div className="w-1.5 h-4 bg-accent rounded-full" />
                  Pilih Tiket Yang Dijual
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted"
                    onClick={selectOnlyCurrentTicket}
                  >
                    Hanya tiket ini
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted"
                    onClick={selectAllTickets}
                  >
                    Pilih semua tiket transaksi ini
                  </button>
                  <span className="text-muted-foreground">Terpilih: {selectedTicketIds.length} tiket</span>
                </div>

                <div className="space-y-2">
                  {sellableTickets.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent"
                        checked={selectedTicketIds.includes(item.id)}
                        onChange={() => toggleTicketSelection(item.id)}
                      />
                      <div className="min-w-0 text-xs">
                        <p className="font-semibold text-foreground truncate">{item.attendeeName}</p>
                        <p className="text-muted-foreground">
                          {item.attendeeEmail || '-'}
                          {item.attendeePhone ? ` | ${item.attendeePhone}` : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Ticket ID: {item.id}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              {/* Pricing Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider">
                  <div className="w-1.5 h-4 bg-accent rounded-full" />
                  Harga Jual
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="askingPrice">Harga Jual (Rp)</Label>
                    <div className="relative">
                      <Input
                        id="askingPrice"
                        type="number"
                        className="pl-12 h-12 text-lg font-mono font-bold"
                        value={askingPrice}
                        onChange={(e) => setAskingPrice(Number(e.target.value))}
                        required
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Rp</span>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                      <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-blue-700 leading-normal">
                        Maksimal <strong>{formatIDR(maxAllowedPrice)}</strong> (Harga asli + 20%). 
                        Kebijakan ini untuk mencegah penimbunan tiket (scalping).
                      </p>
                    </div>
                  </div>

                  <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Harga Jual per Tiket</span>
                      <span className="font-mono text-foreground">{formatIDR(askingPrice)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        Fee Platform (5%) per Tiket <HelpCircle size={12} className="text-muted-foreground/50" />
                      </span>
                      <span className="font-mono text-destructive">-{formatIDR(platformFee)}</span>
                    </div>
                    <div className="pt-2 border-t border-border/60 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Harga Listing ({selectedCount} tiket)</span>
                        <span className="font-mono text-foreground">{formatIDR(totalListingPrice)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Fee Platform</span>
                        <span className="font-mono text-destructive">-{formatIDR(totalPlatformFee)}</span>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-border flex justify-between items-center">
                      <span className="font-bold text-foreground italic">Total yang kamu terima</span>
                      <span className="text-lg font-mono font-bold text-accent">{formatIDR(totalSellerReceives)}</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Note Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider">
                  <div className="w-1.5 h-4 bg-accent rounded-full" />
                  Catatan (Opsional)
                </div>
                <div className="space-y-2">
                  <Textarea 
                    placeholder="Contoh: Jual karena ada acara mendadak, tidak bisa hadir..."
                    className="resize-none h-24"
                    maxLength={200}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="text-[10px] text-right text-muted-foreground">{note.length}/200 karakter</div>
                </div>
              </section>

              {/* Agreement Section */}
              <section className="pt-4 border-t border-border space-y-4">
                {dbUser && !dbUser.isEmailVerified && (
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs">
                    Email Anda belum terverifikasi. {' '}
                    <button
                      type="button"
                      onClick={promptVerifyEmail}
                      className="font-semibold underline hover:no-underline"
                    >
                      Verifikasi sekarang
                    </button>
                    {' '}untuk bisa menjual tiket.
                  </div>
                )}
                <label className="flex gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="mt-1 w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                  />
                  <div className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                    Saya menyetujui bahwa tiket ini akan <strong>dinonaktifkan</strong> segera setelah terjual, 
                    dan saya akan menerima saldo sebesar rincian di atas di dompet Eventra saya. 
                    Listing ini akan aktif sampai penjualan tiket berakhir pada <strong>{ticketType ? formatDate(ticketType.saleEndDate) : '...'}</strong>.
                  </div>
                </label>

                <div className="flex gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1 hover:bg-muted hover:text-foreground border-border"
                    onClick={() => navigate({ to: '/dashboard' })}
                    disabled={submitting}
                  >
                    Batalkan
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-accent text-accent-foreground hover:bg-accent/90 h-11 font-bold shadow-lg shadow-accent/20"
                    disabled={submitting || !dbUser?.isEmailVerified}
                  >
                    {submitting ? 'Memproses...' : 'Daftarkan Tiket'}
                  </Button>
                </div>
              </section>
            </form>
          </div>
          
          <div className="mt-8 flex items-center justify-center gap-8 opacity-40 grayscale">
             <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Verified Ticket</span>
             </div>
             <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Secure Payment</span>
             </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
