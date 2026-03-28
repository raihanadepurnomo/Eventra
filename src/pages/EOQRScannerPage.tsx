import { useState, useRef, useEffect, useCallback } from 'react'
import { QRScannerPlugin } from '@/components/QRScannerPlugin'
import { QrCode, CheckCircle2, XCircle, Search, Camera, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing, mapUser } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatDateRange } from '@/lib/utils'
import type { Ticket, TicketType, Event, EOProfile, Order, User } from '@/types'

type ScanResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'valid'; ticket: Ticket; ticketType: TicketType; event: Event; order: Order; user: User | null; alreadyUsed: boolean }
  | { status: 'invalid'; message: string }

type InputMode = 'manual' | 'camera'

export default function EOQRScannerPage() {
  const { dbUser } = useAuth()
  const [profile, setProfile] = useState<EOProfile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('all')
  const [inputMode, setInputMode] = useState<InputMode>('manual')
  const [qrInput, setQrInput] = useState('')
  const [result, setResult] = useState<ScanResult>({ status: 'idle' })
  const [marking, setMarking] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when switching to manual mode
  useEffect(() => {
    if (inputMode === 'manual') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [inputMode])

  useEffect(() => {
    if (!dbUser) return
    loadEOEvents()
  }, [dbUser])

  async function loadEOEvents() {
    if (!dbUser) return
    setLoadingEvents(true)
    try {
      const profiles = await api.get(`/eo-profiles?user_id=${dbUser.id}`)
      const p = (profiles as EOProfile[])[0]
      if (!p) return
      setProfile(p)
      const rawEvs: any = await api.get(`/events?eo_profile_id=${p.id}&status=${'PUBLISHED'}`)
      setEvents(rawEvs.map(mapEvent))
    } finally {
      setLoadingEvents(false)
    }
  }

  async function handleScan(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return

    setResult({ status: 'loading' })
    setQrInput('')

    try {
      // Find ticket by QR code
      const rawTickets: any = await api.get(`/tickets?qr_code=${trimmed}`)
      const mappedTickets = rawTickets.map(mapTicket)
      const ticket = mappedTickets[0]

      if (!ticket) {
        setResult({ status: 'invalid', message: 'Tiket tidak ditemukan. QR code tidak valid.' })
        return
      }

      // Get ticket type and event
      const rawTT: any = await api.get(`/ticket-types/${ticket.ticketTypeId}`)
      const ticketType = mapTicketType(rawTT)
      if (!ticketType) {
        setResult({ status: 'invalid', message: 'Tipe tiket tidak ditemukan.' })
        return
      }

      const rawEvent: any = await api.get(`/events/${ticketType.eventId}`)
      const event = mapEvent(rawEvent)
      if (!event) {
        setResult({ status: 'invalid', message: 'Data event tidak ditemukan.' })
        return
      }

      // Verify this event belongs to current EO
      if (profile && event.eoProfileId !== profile.id) {
        setResult({ status: 'invalid', message: 'Tiket ini bukan untuk event Anda.' })
        return
      }

      // Filter by selected event if specified
      if (selectedEventId !== 'all' && event.id !== selectedEventId) {
        setResult({ status: 'invalid', message: `Tiket ini bukan untuk event yang dipilih.` })
        return
      }

      // Check ticket status
      if (ticket.status === 'CANCELLED') {
        setResult({ status: 'invalid', message: 'Tiket telah dibatalkan.' })
        return
      }

      const rawOrder: any = await api.get(`/orders/${ticket.orderId}`)
      const order = mapOrder(rawOrder)
      const alreadyUsed = Number(ticket.isUsed) > 0

      // Handle Transferred (Seller) Status
      if (ticket.status === 'TRANSFERRED') {
        setResult({ 
          status: 'invalid', 
          message: 'Tiket Pindah Tangan (Resale). Tiket ini sudah resmi dipindah tangankan via resale dan tidak dapat digunakan lagi oleh pemilik lama.' 
        })
        return
      }

      // Fetch ticket holder user info
      let user: User | null = null
      try {
        const rawUser: any = await api.get(`/users/${ticket.userId}`)
        user = mapUser(rawUser)
      } catch { /* ignore */ }

      setResult({ status: 'valid', ticket, ticketType, event, order, user, alreadyUsed })
    } catch {
      setResult({ status: 'invalid', message: 'Terjadi kesalahan saat memvalidasi tiket.' })
    }
  }

  async function handleMarkUsed() {
    if (result.status !== 'valid') return
    setMarking(true)
    try {
      await api.put(`/tickets/${result.ticket.id}`, {
        isUsed: 1,
        status: 'USED',
        usedAt: new Date().toISOString(),
      })
      toast.success('Tiket berhasil divalidasi!')
      setResult({
        ...result,
        alreadyUsed: true,
        ticket: { ...result.ticket, isUsed: true, status: 'USED' },
      })
    } catch {
      toast.error('Gagal menandai tiket.')
    } finally {
      setMarking(false)
    }
  }

  function handleReset() {
    setResult({ status: 'idle' })
    setQrInput('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Scan Tiket</h1>
            {profile && <p className="text-xs text-muted-foreground">{profile.orgName}</p>}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm" variant={inputMode === 'manual' ? 'default' : 'outline'}
              className={`h-8 text-xs gap-1.5 ${inputMode === 'manual' ? 'bg-accent text-accent-foreground' : ''}`}
              onClick={() => setInputMode('manual')}
            >
              <Keyboard size={12} /> Manual
            </Button>
            <Button
              size="sm" variant={inputMode === 'camera' ? 'default' : 'outline'}
              className={`h-8 text-xs gap-1.5 ${inputMode === 'camera' ? 'bg-accent text-accent-foreground' : ''}`}
              onClick={() => setInputMode('camera')}
            >
              <Camera size={12} /> Kamera
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5">

            {/* Event filter */}
            {loadingEvents ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : events.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Filter Event</Label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="all">Semua Event</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Input / Scanner */}
            {inputMode === 'manual' ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <QrCode className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-foreground">Input Kode Tiket</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Masukkan kode QR tiket secara manual, atau arahkan scanner barcode ke field ini.
                </p>
                <form
                  onSubmit={(e) => { e.preventDefault(); handleScan(qrInput) }}
                  className="flex gap-2"
                >
                  <Input
                    ref={inputRef}
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="Scan atau ketik kode QR tiket..."
                    className="flex-1 font-mono text-sm"
                    autoComplete="off"
                  />
                  <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0" disabled={!qrInput.trim()}>
                    <Search size={14} />
                  </Button>
                </form>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Camera className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-foreground">Scan Kamera</h2>
                </div>
                <div className="rounded-lg bg-background overflow-hidden p-2">
                  <QRScannerPlugin onScan={handleScan} />
                </div>
                <div className="mt-4 text-center">
                  <Button size="sm" variant="outline" onClick={() => setInputMode('manual')}>
                    Beralih ke Manual
                  </Button>
                </div>
              </div>
            )}

            {/* Result */}
            {result.status === 'loading' && (
              <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent" />
                <p className="text-sm text-foreground">Memvalidasi tiket...</p>
              </div>
            )}

            {result.status === 'invalid' && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-destructive">Tiket Tidak Valid</p>
                    <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                    <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" onClick={handleReset}>
                      Scan Lagi
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {result.status === 'valid' && (
              <div className={`rounded-xl border p-5 ${result.alreadyUsed ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
                <div className="flex items-start gap-3 mb-4">
                  <CheckCircle2 className={`w-6 h-6 shrink-0 mt-0.5 ${result.alreadyUsed ? 'text-amber-600' : 'text-emerald-600'}`} />
                  <div>
                    <p className={`text-sm font-bold ${result.alreadyUsed ? 'text-amber-800' : 'text-emerald-800'}`}>
                      {result.alreadyUsed ? 'Tiket Sudah Digunakan' : 'Tiket Valid!'}
                    </p>
                    <div className="flex gap-1.5 mt-0.5">
                      <p className={`text-xs ${result.alreadyUsed ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {result.alreadyUsed ? 'Tiket ini sudah pernah di-scan sebelumnya.' : 'Tiket valid dan belum pernah digunakan.'}
                      </p>
                      {result.ticket.orderId.startsWith('rord_') && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                          Hasil Resale
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background/60 p-4 space-y-2.5 text-sm mb-4">
                  {result.user && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Nama</span>
                        <span className="font-medium text-foreground">{result.user.name || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Email</span>
                        <span className="font-medium text-foreground text-right max-w-56 truncate">{result.user.email}</span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Jumlah Peserta</span>
                    <span className="font-bold text-accent text-lg">{result.ticket.quantity} Orang</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Event</span>
                    <span className="font-medium text-foreground text-right max-w-56 truncate">{result.event.title}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Tipe Tiket</span>
                    <span className="font-medium text-foreground">{result.ticketType.name}</span>
                  </div>
                  
                  {result.ticket.attendeeDetails && Array.isArray(result.ticket.attendeeDetails) && (
                    <div className="pt-2 border-t border-border mt-2 space-y-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Daftar Nama Peserta</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {(result.ticket.attendeeDetails as any[]).map((attn, idx) => (
                          <div key={idx} className="p-2 rounded bg-muted/40 border border-border/50 text-xs">
                            <div className="flex justify-between font-semibold">
                              <span>{idx + 1}. {attn.name || 'Hamba Allah'}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                              <span>{attn.email || '-'}</span>
                              <span>{attn.phone || '-'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-muted-foreground text-[10px]">Ticket ID</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{result.ticket.id.slice(0, 12).toUpperCase()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10px]">Order ID</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{result.ticket.orderId.slice(0, 8).toUpperCase()}</span>
                  </div>
                  {result.ticket.usedAt && (
                    <div className="flex items-center justify-between text-amber-700">
                      <span className="text-[10px]">Terakhir di-scan</span>
                      <span className="text-[10px] font-medium">{formatDate(result.ticket.usedAt)}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {!result.alreadyUsed && (
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                      onClick={handleMarkUsed}
                      disabled={marking}
                    >
                      {marking ? 'Memproses...' : '✓ Tandai Sudah Masuk'}
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1 text-sm" onClick={handleReset}>
                    Scan Berikutnya
                  </Button>
                </div>
              </div>
            )}

            {result.status === 'idle' && (
              <div className="text-center py-12 rounded-xl border border-dashed border-border">
                <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Siap Memvalidasi</p>
                <p className="text-xs text-muted-foreground">Masukkan kode QR tiket di atas untuk memulai validasi.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
