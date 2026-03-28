// @ts-nocheck
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { Calendar, MapPin, ExternalLink, Building2, Minus, Plus, ShoppingCart, ArrowLeft, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatIDR, formatDateRange } from '@/lib/utils'
import { FUNCTIONS } from '@/lib/functions'
import type { Event, TicketType, EOProfile, ResaleListing } from '@/types'

// Midtrans Snap client key (public, safe to expose)
const MIDTRANS_CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY ?? ''

declare global {
  interface Window {
    snap?: {
      pay: (token: string, options: {
        onSuccess: (result: unknown) => void
        onPending: (result: unknown) => void
        onError: (result: unknown) => void
        onClose: () => void
      }) => void
    }
  }
}

const CATEGORY_BADGE: Record<string, string> = {
  Konser: 'bg-violet-100 text-violet-700',
  Festival: 'bg-pink-100 text-pink-700',
  Seminar: 'bg-blue-100 text-blue-700',
  Workshop: 'bg-orange-100 text-orange-700',
  Sports: 'bg-green-100 text-green-700',
  Exhibition: 'bg-yellow-100 text-yellow-700',
  default: 'bg-indigo-100 text-indigo-700',
}

function isSaleActive(tt: TicketType): boolean {
  const now = Date.now()
  return now >= new Date(tt.saleStartDate).getTime() && now <= new Date(tt.saleEndDate).getTime()
}

interface ResaleTicket { listing: ResaleListing; ticketTypeName: string; price: number }

function TicketRow({
  tt,
  qty,
  ownedCount,
  hasOwnershipData,
  onChange,
}: {
  tt: TicketType
  qty: number
  ownedCount: number
  hasOwnershipData: boolean
  onChange: (id: string, q: number) => void
}) {
  const remaining = Number(tt.quota) - Number(tt.sold)
  const soldOut = remaining <= 0
  const active = isSaleActive(tt)
  const maxPerOrder = Number(tt.maxPerOrder || 0)
  const maxPerAccount = Number(tt.maxPerAccount || 0)
  const remainingPerAccount = maxPerAccount > 0
    ? Math.max(0, maxPerAccount - Number(ownedCount || 0))
    : Number.POSITIVE_INFINITY
  const reachedAccountLimit = maxPerAccount > 0 && remainingPerAccount <= 0
  const maxSelectableQty = Math.max(0, Math.min(
    remaining,
    maxPerOrder > 0 ? maxPerOrder : Number.POSITIVE_INFINITY,
    remainingPerAccount
  ))
  const disabled = soldOut || !active || reachedAccountLimit

  return (
    <div className={`p-3 rounded-lg border ${disabled ? 'opacity-60 bg-muted/30' : 'bg-background'} border-border`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{tt.name}</p>
          {tt.description && <p className="text-xs text-muted-foreground mt-0.5">{tt.description}</p>}
          <div className="flex items-center gap-2 mt-1">
            {Number(tt.price) === 0 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                GRATIS
              </span>
            ) : (
              <span className="text-sm font-bold font-mono text-foreground">{formatIDR(Number(tt.price))}</span>
            )}
            {soldOut ? <span className="text-xs text-destructive">Habis</span>
              : !active ? <span className="text-xs text-muted-foreground">Belum tersedia</span>
              : <span className="text-xs text-muted-foreground">{remaining} tersisa</span>}
          </div>

          {maxPerAccount > 0 && hasOwnershipData && (
            reachedAccountLimit ? (
              <p className="text-[11px] text-destructive mt-1.5">
                Kamu sudah mencapai batas pembelian untuk tiket ini (maks. {maxPerAccount} tiket per akun).
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Maks. {maxPerAccount} tiket per akun.
              </p>
            )
          )}

          {maxPerAccount > 0 && !hasOwnershipData && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Maks. {maxPerAccount} tiket per akun.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(tt.id, Math.max(0, qty - 1))} disabled={disabled || qty === 0}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(tt.id, Math.min(maxSelectableQty, qty + 1))} disabled={disabled || qty >= maxSelectableQty}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function BookingCard({ 
  ticketTypes, quantities, ownedTicketCounts, hasOwnershipData, selectedItems, total, totalQty, buying, isAuthenticated, countdown, onQtyChange, onBuy,
  step, attendeeForms, onAttendeeChange, onBack,
  buyForSelf, onSelfToggle, currentUser
}: {
  ticketTypes: TicketType[]; quantities: Record<string, number>; ownedTicketCounts: Record<string, number>; hasOwnershipData: boolean; selectedItems: TicketType[]
  total: number; totalQty: number; buying: boolean; isAuthenticated: boolean
  countdown: string | null; onQtyChange: (id: string, q: number) => void; onBuy: () => void
  step: 'select' | 'details', attendeeForms: Record<string, any[]>, onAttendeeChange: (ttId: string, idx: number, field: string, val: string) => void, onBack: () => void,
  buyForSelf: boolean, onSelfToggle: (val: boolean) => void, currentUser: any
}) {
  const firstSelectedTtId = selectedItems[0]?.id

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">
          {step === 'select' ? 'Pilih Tiket' : 'Data Peserta'}
        </h3>
      </div>

      {countdown && step === 'select' && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <Clock size={12} />
          Selesaikan pembayaran dalam <strong className="font-mono">{countdown}</strong>
        </div>
      )}

      {step === 'select' ? (
        <>
          {ticketTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada tiket tersedia.</p>
          ) : (
            <div className="space-y-2.5 mb-4">
              {ticketTypes.map((tt) => (
                <TicketRow
                  key={tt.id}
                  tt={tt}
                  qty={quantities[tt.id] ?? 0}
                  ownedCount={ownedTicketCounts[tt.id] ?? 0}
                  hasOwnershipData={hasOwnershipData}
                  onChange={onQtyChange}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar text-foreground">
          <div className="flex items-center gap-2 px-1 py-1 border-b border-border pb-3 mb-2">
            <input 
              type="checkbox" 
              id="buyForSelf" 
              checked={buyForSelf} 
              onChange={(e) => onSelfToggle(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <label htmlFor="buyForSelf" className="text-xs font-medium cursor-pointer">Tiket ini untuk saya sendiri</label>
          </div>

          {selectedItems.map((tt) => (
            <div key={tt.id} className="space-y-3">
              <p className="text-xs font-bold text-accent uppercase tracking-wider">{tt.name}</p>
              {Array.from({ length: quantities[tt.id] }).map((_, i) => {
                const isAutoFilled = buyForSelf && tt.id === firstSelectedTtId && i === 0
                return (
                  <div key={i} className={`p-3 rounded-lg border border-border ${isAutoFilled ? 'bg-accent/5' : 'bg-muted/20'} space-y-2 relative transition-colors`}>
                    <p className="text-[10px] font-medium text-muted-foreground flex justify-between">
                      Peserta {i + 1}
                      {isAutoFilled && <span className="text-accent underline font-bold">Data Anda</span>}
                    </p>
                    <input
                      type="text"
                      placeholder="Nama Lengkap"
                      className={`w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-accent outline-none ${isAutoFilled ? 'opacity-70 cursor-not-allowed' : ''}`}
                      value={isAutoFilled ? currentUser?.name || '' : (attendeeForms[tt.id]?.[i]?.name || '')}
                      onChange={(e) => onAttendeeChange(tt.id, i, 'name', e.target.value)}
                      readOnly={isAutoFilled}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="email"
                        placeholder="Email"
                        className={`w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-accent outline-none ${isAutoFilled ? 'opacity-70 cursor-not-allowed' : ''}`}
                        value={isAutoFilled ? currentUser?.email || '' : (attendeeForms[tt.id]?.[i]?.email || '')}
                        onChange={(e) => onAttendeeChange(tt.id, i, 'email', e.target.value)}
                        readOnly={isAutoFilled}
                      />
                      <input
                        type="tel"
                        placeholder="No. HP"
                        className={`w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-accent outline-none ${isAutoFilled ? 'opacity-70 cursor-not-allowed' : ''}`}
                        value={isAutoFilled ? currentUser?.phone || '' : (attendeeForms[tt.id]?.[i]?.phone || '')}
                        onChange={(e) => onAttendeeChange(tt.id, i, 'phone', e.target.value)}
                        readOnly={isAutoFilled}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {selectedItems.length > 0 && (
        <div className="border-t border-border pt-3 mb-4 space-y-1.5">
          {selectedItems.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t.name} x{quantities[t.id]}</span>
              <span className="font-mono">{Number(t.price) === 0 ? 'GRATIS' : formatIDR(Number(t.price) * (quantities[t.id] ?? 0))}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm font-bold text-foreground pt-1 border-t border-border mt-1">
            <span>Total</span>
            <span className="font-mono">{total === 0 && totalQty > 0 ? 'GRATIS' : formatIDR(total)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {step === 'details' && (
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={buying}>
            Kembali
          </Button>
        )}
        <Button
          className="flex-[2] bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={buying || (step === 'select' && totalQty === 0)}
          onClick={onBuy}
        >
          {buying
            ? 'Memproses...'
            : !isAuthenticated
              ? 'Masuk untuk Membeli'
              : step === 'select'
                ? 'Lanjut Isi Data'
                : total === 0
                  ? 'Ambil Tiket Sekarang'
                  : 'Bayar Sekarang'}
        </Button>
      </div>
      
      {!isAuthenticated && (
        <p className="text-xs text-muted-foreground text-center mt-2">Login dengan akun untuk membeli tiket</p>
      )}
    </div>
  )
}

export default function EventDetailPage() {
  const { id } = useParams({ from: '/events/$id' })
  const navigate = useNavigate()
  const { dbUser, isAuthenticated, login } = useAuth()
  const snapScriptRef = useRef(false)

  const [event, setEvent] = useState<Event | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [eoProfile, setEOProfile] = useState<EOProfile | null>(null)
  const [resaleTickets, setResaleTickets] = useState<ResaleTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [buying, setBuying] = useState(false)
  const [countdown, setCountdown] = useState<string | null>(null)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [step, setStep] = useState<'select' | 'details'>('select')
  const [attendeeForms, setAttendeeForms] = useState<Record<string, any[]>>({})
  const [ownedTicketCounts, setOwnedTicketCounts] = useState<Record<string, number>>({})
  const [hasOwnershipData, setHasOwnershipData] = useState(false)
  const [buyForSelf, setBuyForSelf] = useState(true)
  const [buyingResale, setBuyingResale] = useState<string | null>(null)
  
  // Resale attendee details
  const [resaleAttendee, setResaleAttendee] = useState({ name: '', email: '', phone: '' })
  const [resaleModalOpen, setResaleModalOpen] = useState(false)
  const [activeResaleListing, setActiveResaleListing] = useState<ResaleListing | null>(null)

  // Load Midtrans Snap script
  useEffect(() => {
    if (snapScriptRef.current || !MIDTRANS_CLIENT_KEY) return
    snapScriptRef.current = true
    const isProduction = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true'
    const snapUrl = isProduction
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js'
    const script = document.createElement('script')
    script.src = snapUrl
    script.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const evRaw = await api.get<Record<string, unknown>>(`/events/${id}`)
        if (!evRaw) { navigate({ to: '/events' }); return }
        const ev = mapEvent(evRaw)
        setEvent(ev)
        const ttsRaw = await api.get<Record<string, unknown>[]>(`/ticket-types?event_id=${id}`)
        let eoRaw: Record<string, unknown> | null = null
        const profileId = ev.eoProfileId ?? evRaw.eo_profile_id
        if (profileId) {
          try {
            eoRaw = await api.get<Record<string, unknown>>(`/eo-profiles/${profileId}`)
          } catch (e) {
            console.warn('Failed to load EO Profile:', e)
          }
        }
        const tts = ttsRaw.map(mapTicketType)
        setTicketTypes(tts)
        setEOProfile(eoRaw ? mapEOProfile(eoRaw) : null)
        const initQty: Record<string, number> = {}
        tts.forEach((t) => { initQty[t.id] = 0 })
        setQuantities(initQty)

        // Load resale listings if allowed
        if (ev.isResaleAllowed) {
          const resaleListingsRaw = await api.get<Record<string, unknown>[]>(`/resale/listings?event_id=${id}`)
          const resaleResults: ResaleTicket[] = []
          for (const rRaw of resaleListingsRaw) {
            const l = mapResaleListing(rRaw)
            resaleResults.push({ 
              listing: l, 
              ticketTypeName: l.ticketTypeName || 'Tiket', 
              price: Number(l.askingPrice) 
            })
          }
          setResaleTickets(resaleResults)
        } else {
          setResaleTickets([])
        }
      } catch {
        navigate({ to: '/events' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, navigate])

  useEffect(() => {
    if (!isAuthenticated || !dbUser) {
      setOwnedTicketCounts({})
      setHasOwnershipData(false)
      return
    }

    let cancelled = false
    async function loadOwnedTicketCounts() {
      try {
        const raw = await api.get<Record<string, number>>(`/events/${id}/my-ticket-count`)
        if (cancelled) return
        const normalized: Record<string, number> = {}
        Object.entries(raw || {}).forEach(([ticketTypeId, count]) => {
          normalized[ticketTypeId] = Number(count || 0)
        })
        setOwnedTicketCounts(normalized)
        setHasOwnershipData(true)
      } catch (err) {
        if (cancelled) return
        console.warn('Failed to load owned ticket counts:', err)
        setOwnedTicketCounts({})
        setHasOwnershipData(false)
      }
    }

    loadOwnedTicketCounts()
    return () => { cancelled = true }
  }, [dbUser, id, isAuthenticated])

  // Countdown timer for pending order
  useEffect(() => {
    if (!pendingOrderId) { setCountdown(null); return }
    const interval = setInterval(async () => {
      const orderRaw = await api.get<Record<string, unknown>>(`/orders/${pendingOrderId}`)
      if (!orderRaw || orderRaw.status !== 'PENDING') { clearInterval(interval); setPendingOrderId(null); return }
      const order = mapOrder(orderRaw)
      const exp = new Date(order.expiredAt).getTime()
      const diff = exp - Date.now()
      if (diff <= 0) { clearInterval(interval); setPendingOrderId(null); setCountdown(null); return }
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [pendingOrderId])

  function getMaxSelectable(tt: TicketType) {
    const remainingQuota = Number(tt.quota) - Number(tt.sold)
    const perOrderLimit = Number(tt.maxPerOrder || 0)
    const perAccountLimit = Number(tt.maxPerAccount || 0)
    const ownedCount = Number(ownedTicketCounts[tt.id] || 0)
    const remainingPerAccount = perAccountLimit > 0
      ? Math.max(0, perAccountLimit - ownedCount)
      : Number.POSITIVE_INFINITY

    return Math.max(0, Math.min(
      remainingQuota,
      perOrderLimit > 0 ? perOrderLimit : Number.POSITIVE_INFINITY,
      remainingPerAccount
    ))
  }

  useEffect(() => {
    setQuantities((prev) => {
      const next = { ...prev }
      let changed = false

      for (const tt of ticketTypes) {
        const maxSelectable = getMaxSelectable(tt)
        const current = next[tt.id] ?? 0
        if (current > maxSelectable) {
          next[tt.id] = maxSelectable
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [ticketTypes, ownedTicketCounts])

  function handleQtyChange(ticketTypeId: string, qty: number) {
    const ticketType = ticketTypes.find((tt) => tt.id === ticketTypeId)
    const maxSelectable = ticketType ? getMaxSelectable(ticketType) : qty
    const safeQty = Math.max(0, Math.min(qty, maxSelectable))

    setQuantities((prev) => ({ ...prev, [ticketTypeId]: safeQty }))
    // Initialize forms for this ticket type
    setAttendeeForms(prev => {
      const current = prev[ticketTypeId] || []
      const next = [...current]
      if (safeQty > next.length) {
        for (let i = next.length; i < safeQty; i++) next.push({ name: '', email: '', phone: '' })
      } else {
        next.splice(safeQty)
      }
      return { ...prev, [ticketTypeId]: next }
    })
  }

  function handleAttendeeChange(ttId: string, idx: number, field: string, val: string) {
    setAttendeeForms(prev => {
      const next = [...(prev[ttId] || [])]
      if (!next[idx]) next[idx] = { name: '', email: '', phone: '' }
      next[idx] = { ...next[idx], [field]: val }
      return { ...prev, [ttId]: next }
    })
  }

  const selectedItems = ticketTypes.filter((t) => (quantities[t.id] ?? 0) > 0)
  const total = selectedItems.reduce((sum, t) => sum + Number(t.price) * (quantities[t.id] ?? 0), 0)
  const totalQty = selectedItems.reduce((sum, t) => sum + (quantities[t.id] ?? 0), 0)

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
        const q = new URLSearchParams({
          email: dbUser.email,
          type: 'verify_email',
          from: 'profile',
        })
        window.location.href = `/verify-otp?${q.toString()}`
      },
    })
  }

  async function handleBuy() {
    if (!isAuthenticated) { navigate({ to: '/login' }); return }
    if (!dbUser?.isEmailVerified) {
      promptVerifyEmail()
      return
    }
    if (totalQty === 0) { toast.error('Pilih minimal 1 tiket'); return }
    
    // Switch to details step if first click
    if (step === 'select') {
      setStep('details')
      return
    }

    // Validate and prepopulate if self
    const firstSelectedTtId = selectedItems[0]?.id
    let selfPhone = ''
    
    for (const tt of selectedItems) {
      const forms = attendeeForms[tt.id] || []
      for (let i = 0; i < (quantities[tt.id] || 0); i++) {
        let name = forms[i]?.name
        let email = forms[i]?.email
        let phone = forms[i]?.phone
        
        if (buyForSelf && tt.id === firstSelectedTtId && i === 0) {
           name = dbUser.name
           email = dbUser.email
           selfPhone = dbUser.phone || phone
        }
        if (!name) { toast.error(`Nama peserta ${i+1} untuk ${tt.name} harus diisi`); return }
      }
    }

    if (!dbUser) return

    // Sync phone to profile if changed/provided
    if (buyForSelf && selfPhone && selfPhone !== dbUser.phone) {
      try {
        await api.put(`/users/${dbUser.id}`, { phone: selfPhone })
      } catch (err) {
        console.warn('Failed to sync phone to profile:', err)
      }
    }

    setBuying(true)
    try {
      const orderId = crypto.randomUUID()
      const now = new Date().toISOString()
      const expiredAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

      const orderRes: any = await api.post('/orders', {
        id: orderId, userId: dbUser.id, totalAmount: total,
        status: total === 0 ? 'PAID' : 'PENDING',
        expiredAt: total === 0 ? undefined : expiredAt,
        createdAt: now,
        items: selectedItems.map(tt => {
          const qty = quantities[tt.id] ?? 0;
          return {
            ticketTypeId: tt.id,
            quantity: qty,
            unitPrice: Number(tt.price),
            subtotal: Number(tt.price) * qty,
            attendee_details: (attendeeForms[tt.id] || []).map((a, i) => {
              if (buyForSelf && tt.id === firstSelectedTtId && i === 0) {
                return { ...a, name: dbUser.name, email: dbUser.email, phone: dbUser.phone }
              }
              return a
            })
          };
        }),
      })

      const isFreeOrder = Boolean(orderRes?.is_free ?? orderRes?.isFree)
      if (isFreeOrder) {
        toast.success('Tiket gratis berhasil diambil!')
        navigate({ to: '/dashboard' })
        return
      }

      setPendingOrderId(orderId)

      // Get Midtrans snap token — if no client key, fall back to auto-PAID (dev mode)
      if (!MIDTRANS_CLIENT_KEY || !window.snap) {
        // Dev fallback: auto-complete without Midtrans
        await api.put(`/orders/${orderId}`, { status: 'PAID', paidAt: now })
        for (const tt of selectedItems) {
          const qty = quantities[tt.id] ?? 0
          // Updated: Create ONE grouped ticket instead of looping
          await api.post('/tickets', {
            id: crypto.randomUUID(), 
            orderId, 
            userId: dbUser.id,
            ticketTypeId: tt.id, 
            qrCode: crypto.randomUUID(),
            status: 'ACTIVE', 
            isUsed: 0, 
            createdAt: now,
            quantity: qty,
            attendee_details: (attendeeForms[tt.id] || []).map((a, i) => {
              if (buyForSelf && tt.id === firstSelectedTtId && i === 0) {
                return { ...a, name: dbUser.name, email: dbUser.email, phone: dbUser.phone }
              }
              return a
            })
          })
          await api.put(`/ticket-types/${tt.id}`, { sold: Number(tt.sold) + qty })
        }
        toast.success('Tiket berhasil dibeli!')
        navigate({ to: '/dashboard' })
        return
      }

      // 4. Call edge function to get snap token
      const authToken = await localStorage.getItem('eventra_token')
      const res = await fetch(FUNCTIONS.paymentCreate ?? '/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ orderId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to create payment')
      }

      const { token } = await res.json()

      // 5. Open Midtrans Snap popup
      window.snap!.pay(token, {
        onSuccess: async () => {
          toast.success('Pembayaran berhasil! Tiket sedang diproses...')
          try {
            await fetch(`http://localhost:5000/api/payment/check/${orderId}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${authToken}` }
            })
          } catch {}
          navigate({ to: '/dashboard' })
        },
        onPending: () => {
          toast('Pembayaran sedang diproses. Cek dashboard untuk statusnya.')
          navigate({ to: '/dashboard' })
        },
        onError: () => {
          toast.error('Pembayaran gagal. Silakan coba lagi.')
          setBuying(false)
          setPendingOrderId(null)
        },
        onClose: () => {
          toast('Jendela pembayaran ditutup. Lanjutkan di Dashboard.')
          navigate({ to: '/dashboard' })
        },
      })
    } catch (err) {
      toast.error(`Gagal memproses pembayaran: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setBuying(false)
      setPendingOrderId(null)
    }
  }

  async function handleBuyResale(listing: ResaleListing) {
    if (!isAuthenticated) { navigate({ to: '/login' }); return }
    if (!dbUser?.isEmailVerified) {
      promptVerifyEmail()
      return
    }
    setActiveResaleListing(listing)
    
    // Auto-fill if for self
    if (buyForSelf) {
      setResaleAttendee({
        name: dbUser?.name || '',
        email: dbUser?.email || '',
        phone: dbUser?.phone || ''
      })
    } else {
      setResaleAttendee({ name: '', email: '', phone: '' })
    }
    
    setResaleModalOpen(true)
  }

  async function confirmResalePurchase() {
    if (!activeResaleListing) return
    if (!resaleAttendee.name) { toast.error('Nama harus diisi'); return }
    
    setBuyingResale(activeResaleListing.id)
    try {
      const res: any = await api.post(`/resale/listings/${activeResaleListing.id}/buy`, {
        attendee_details: [resaleAttendee] // Wrap in array as backend handles many or one
      })
      const { snapToken } = res

      if (!window.snap) {
        toast.error('Gagal memuat sistem pembayaran')
        return
      }

      window.snap.pay(snapToken, {
        onSuccess: () => {
          toast.success('Tiket resale berhasil dibeli!')
          navigate({ to: '/dashboard' })
        },
        onPending: () => {
          toast('Pembayaran tertunda. Cek dashboard untuk status.')
          navigate({ to: '/dashboard' })
        },
        onError: () => {
          toast.error('Pembayaran gagal')
          setBuyingResale(null)
        },
        onClose: () => {
          setBuyingResale(null)
        }
      })
    } catch (err: any) {
      toast.error(err.message || 'Gagal memulai pembelian resale')
    } finally {
      setBuyingResale(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="pt-14 flex-1">
          <Skeleton className="h-64 w-full" />
          <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </main>
      </div>
    )
  }

  if (!event) return null

  const badgeCls = CATEGORY_BADGE[event.category] ?? CATEGORY_BADGE.default

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="pt-14 flex-1">
        {/* Banner */}
        <div className="relative h-56 md:h-72 bg-gradient-to-br from-indigo-500 to-violet-700 overflow-hidden">
          {event.bannerImage && (
            <img src={event.bannerImage} alt={event.title} className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-4">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badgeCls} mb-2 inline-block`}>{event.category}</span>
            <StatusBadge status={event.status} className="ml-2" />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button onClick={() => navigate({ to: '/events' })} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft size={14} /> Kembali ke Event
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left */}
            <div className="lg:col-span-2 space-y-6">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{event.title}</h1>

              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4 shrink-0 text-accent" />
                  <span>{formatDateRange(event.startDate, event.endDate)}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0 text-accent mt-0.5" />
                  <div>
                    <span>{event.location}</span>
                    {event.locationUrl && (
                      <a href={event.locationUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-accent hover:underline text-xs">
                        Lihat Maps <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
                {eoProfile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="w-4 h-4 shrink-0 text-accent" />
                    <span>Diselenggarakan oleh <span className="font-medium text-foreground">{eoProfile.orgName}</span></span>
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-2">Tentang Event</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{event.description}</p>
              </div>

              {/* Resale listings */}
              {resaleTickets.length > 0 && (
                <div className="pt-8 border-t border-border">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-foreground">Pasar Resale Resmi</h2>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-emerald-200">Legal & Terverifikasi</span>
                  </div>
                  <div className="grid gap-3">
                    {resaleTickets.map(({ listing, ticketTypeName, price }) => (
                      <div key={listing.id} className="group flex items-center justify-between p-4 rounded-xl border border-amber-200 bg-amber-50/30 hover:bg-amber-50/50 transition-colors">
                        <div className="min-w-0 flex-1 pr-4">
                          <p className="text-sm font-bold text-foreground">{ticketTypeName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                             <span className="text-[10px] text-amber-700 font-medium">Penjual: @{listing.sellerUsername}</span>
                             {listing.note && <span className="text-[10px] text-muted-foreground italic truncate">"{listing.note}"</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                           <span className="text-sm font-mono font-bold text-foreground">{formatIDR(price)}</span>
                           <Button 
                              size="sm" 
                              className="bg-accent text-accent-foreground font-bold shadow-sm h-8"
                              onClick={() => handleBuyResale(listing)}
                              disabled={buyingResale === listing.id}
                           >
                              {buyingResale === listing.id ? '...' : 'Beli'}
                           </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-4 italic">
                    * Tiket resale adalah tiket yang dijual kembali oleh pemilik sah tiket. 
                    QR code lama akan otomatis hangus dan Anda akan menerima QR code baru yang valid.
                  </p>
                </div>
              )}

              {/* Mobile booking card */}
              <div className="lg:hidden">
                <BookingCard
                  ticketTypes={ticketTypes} quantities={quantities} ownedTicketCounts={ownedTicketCounts} hasOwnershipData={hasOwnershipData} selectedItems={selectedItems}
                  total={total} totalQty={totalQty} buying={buying} isAuthenticated={isAuthenticated}
                  countdown={countdown} onQtyChange={handleQtyChange} onBuy={handleBuy}
                  step={step} attendeeForms={attendeeForms} onAttendeeChange={handleAttendeeChange}
                  onBack={() => setStep('select')}
                  buyForSelf={buyForSelf} onSelfToggle={setBuyForSelf} currentUser={dbUser}
                />
              </div>
            </div>

            {/* Right (sticky desktop) */}
            <div className="hidden lg:block">
              <div className="sticky top-20">
                <BookingCard
                  ticketTypes={ticketTypes} quantities={quantities} ownedTicketCounts={ownedTicketCounts} hasOwnershipData={hasOwnershipData} selectedItems={selectedItems}
                  total={total} totalQty={totalQty} buying={buying} isAuthenticated={isAuthenticated}
                  countdown={countdown} onQtyChange={handleQtyChange} onBuy={handleBuy}
                  step={step} attendeeForms={attendeeForms} onAttendeeChange={handleAttendeeChange}
                  onBack={() => setStep('select')}
                  buyForSelf={buyForSelf} onSelfToggle={setBuyForSelf} currentUser={dbUser}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      
      {/* Resale Attendee Modal */}
      <Dialog open={resaleModalOpen} onOpenChange={setResaleModalOpen}>
         <DialogContent className="sm:max-w-md">
            <DialogHeader>
               <DialogTitle>Data Peserta Tiket Resale</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
               <div className="flex items-center gap-2 px-1 py-1 border-b border-border pb-3 mb-2">
                 <input 
                   type="checkbox" 
                   id="resaleBuyForSelf" 
                   checked={buyForSelf} 
                   onChange={(e) => {
                     const val = e.target.checked
                     setBuyForSelf(val)
                     if (val) {
                       setResaleAttendee({
                         name: dbUser?.name || '',
                         email: dbUser?.email || '',
                         phone: dbUser?.phone || ''
                       })
                     }
                   }}
                   className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                 />
                 <label htmlFor="resaleBuyForSelf" className="text-xs font-medium cursor-pointer">Tiket ini untuk saya sendiri</label>
               </div>

               <div className="space-y-3">
                  <div className="space-y-1">
                     <Label htmlFor="resaleName" className="text-xs">Nama Lengkap</Label>
                     <Input 
                       id="resaleName" 
                       placeholder="Contoh: Budi Santoso" 
                       value={resaleAttendee.name}
                       onChange={(e) => setResaleAttendee(p => ({ ...p, name: e.target.value }))}
                       readOnly={buyForSelf}
                       className={buyForSelf ? 'bg-muted/50 cursor-not-allowed text-xs' : 'text-xs'}
                     />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1">
                        <Label htmlFor="resaleEmail" className="text-xs">Email</Label>
                        <Input 
                          id="resaleEmail" 
                          type="email" 
                          placeholder="budi@email.com" 
                          value={resaleAttendee.email}
                          onChange={(e) => setResaleAttendee(p => ({ ...p, email: e.target.value }))}
                          readOnly={buyForSelf}
                          className={buyForSelf ? 'bg-muted/50 cursor-not-allowed text-xs' : 'text-xs'}
                        />
                     </div>
                     <div className="space-y-1">
                        <Label htmlFor="resalePhone" className="text-xs">No. HP</Label>
                        <Input 
                          id="resalePhone" 
                          type="tel" 
                          placeholder="0812..." 
                          value={resaleAttendee.phone}
                          onChange={(e) => setResaleAttendee(p => ({ ...p, phone: e.target.value }))}
                          readOnly={buyForSelf}
                          className={buyForSelf ? 'bg-muted/50 cursor-not-allowed text-xs' : 'text-xs'}
                        />
                     </div>
                  </div>
               </div>

               <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex gap-3">
                 <Clock size={16} className="text-amber-600 mt-0.5" />
                 <p className="text-[10px] text-amber-700 leading-relaxed">
                   Pastikan data sudah benar. Tiket resale akan segera diproses setelah pembayaran berhasil dan status kepemilikan akan berpindah ke data di atas.
                 </p>
               </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
               <Button variant="outline" onClick={() => setResaleModalOpen(false)} className="flex-1">Batal</Button>
               <Button 
                className="flex-[2] bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={confirmResalePurchase}
                disabled={!!buyingResale}
               >
                 {buyingResale ? 'Memproses...' : 'Lanjut ke Pembayaran'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  )
}
