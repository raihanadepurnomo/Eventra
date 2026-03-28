import { useState, useEffect, useRef } from 'react'
import { Landmark, ArrowUpRight, History, Clock, CheckCircle2, XCircle, AlertCircle, Download, ExternalLink, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { formatIDR, formatDate } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from '@tanstack/react-router'

interface Withdrawal {
  id: string
  amount: number
  bank_name: string
  account_number: string
  account_name: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'
  created_at: string
  processed_at?: string
  receipt_url?: string
  rejected_reason?: string
}

export default function EOFinancePage() {
  const [balance, setBalance] = useState<{ availableBalance: number; totalEarned: number; totalWithdrawn: number; balanceId: string } | null>(null)
  const [history, setHistory] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [receiptModal, setReceiptModal] = useState<string | null>(null)

  // Form
  const [amount, setAmount] = useState('')
  const [bank, setBank] = useState('')
  const [accNo, setAccNo] = useState('')
  const [accName, setAccName] = useState('')

  const { dbUser } = useAuth()
  const navigate = useNavigate()

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (dbUser) loadData()
  }, [dbUser])

  // Auto-refresh every 10 seconds (silent, no loading spinner)
  useEffect(() => {
    if (!dbUser) return
    pollIntervalRef.current = setInterval(() => {
      silentRefresh()
    }, 10000)
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [dbUser])

  async function loadData() {
    if (!dbUser) return
    setLoading(true)
    try {
      const profiles = await api.get(`/eo-profiles?user_id=${dbUser.id}`)
      const p = (profiles as any[])[0]
      if (!p) {
        navigate({ to: '/eo/setup' })
        return
      }

      const [bal, his]: [any, any] = await Promise.all([
        api.get('/eo/balance'),
        api.get('/eo/withdrawals')
      ])
      setBalance(bal)
      setHistory(his)
    } catch (err: any) {
      console.error('EO Finance Load Error:', err)
      toast.error('Gagal memuat data keuangan: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  async function silentRefresh() {
    if (!dbUser) return
    try {
      const [bal, his]: [any, any] = await Promise.all([
        api.get('/eo/balance'),
        api.get('/eo/withdrawals')
      ])
      setBalance(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(bal)) return bal
        return prev
      })
      setHistory(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(his)) return his
        return prev
      })
    } catch {
      // silently fail
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault()
    if (!balance) return

    const numAmount = Number(amount)
    if (numAmount < 50000) return toast.error('Minimal pencairan Rp 50.000')
    if (numAmount > balance.availableBalance) return toast.error('Saldo tidak mencukupi')

    setSubmitting(true)
    try {
      await api.post('/eo/withdraw', {
        amount: numAmount,
        bank_name: bank,
        account_number: accNo,
        account_name: accName,
        balance_id: balance.balanceId
      })
      toast.success('Permintaan pencairan berhasil diajukan')
      setAmount('')
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengajukan pencairan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Landmark size={16} className="text-accent" /> Manajemen Keuangan
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-8">

            {/* Balance Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 p-8 rounded-3xl bg-accent text-white shadow-lg shadow-accent/20 relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-accent-foreground/80 text-xs font-bold uppercase tracking-widest mb-2">Saldo Bisa Dicairkan</p>
                  {loading ? <Skeleton className="h-12 w-48 bg-white/20" /> : (
                    <h2 className="text-4xl font-bold font-mono mb-6">
                      {formatIDR(balance?.availableBalance || 0)}
                    </h2>
                  )}
                  <div className="flex gap-8">
                    <div>
                      <p className="text-accent-foreground/60 text-[10px] uppercase font-bold mb-1">Total Pendapatan</p>
                      <p className="text-sm font-bold font-mono">{formatIDR(balance?.totalEarned || 0)}</p>
                    </div>
                    <div>
                      <p className="text-accent-foreground/60 text-[10px] uppercase font-bold mb-1">Sudah Dicairkan</p>
                      <p className="text-sm font-bold font-mono">{formatIDR(balance?.totalWithdrawn || 0)}</p>
                    </div>
                  </div>
                </div>
                <Landmark className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10 rotate-12" />
              </div>

              <div className="p-6 rounded-3xl border border-border bg-card flex flex-col justify-center">
                <div className="p-3 w-10 h-10 rounded-xl bg-amber-50 text-amber-600 mb-4">
                  <AlertCircle size={20} />
                </div>
                <h3 className="font-bold text-sm mb-2">Informasi Penting</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Pendapatan dari tiket yang di-resale oleh pembeli akan secara otomatis dikurangi dari saldo Anda. Pastikan bank tujuan sudah benar.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Withdrawal Form */}
              <div className="lg:col-span-2 space-y-6">
                <div className="p-6 rounded-2xl border border-border bg-card">
                  <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
                    <ArrowUpRight size={18} className="text-accent" /> Ajukan Pencairan
                  </h3>
                  <form onSubmit={handleWithdraw} className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Nominal (Rp)</label>
                        <button
                          type="button"
                          onClick={() => balance && setAmount(balance.availableBalance.toString())}
                          className="text-[10px] font-bold text-accent hover:underline"
                        >
                          Cairkan Semua
                        </button>
                      </div>
                      <Input
                        type="number"
                        placeholder="Min. 50.000"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        required
                        className="h-11 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Nama Bank</label>
                      <select
                        value={bank}
                        onChange={e => setBank(e.target.value)}
                        required
                        className="w-full h-11 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">Pilih Bank</option>
                        <option value="BCA">BCA</option>
                        <option value="Mandiri">Mandiri</option>
                        <option value="BNI">BNI</option>
                        <option value="BRI">BRI</option>
                        <option value="BTN">BTN</option>
                        <option value="CIMB Niaga">CIMB Niaga</option>
                        <option value="Permata">Permata</option>
                        <option value="Danamon">Danamon</option>
                        <option value="BSI">BSI</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">No. Rekening</label>
                        <Input
                          placeholder="123456789"
                          value={accNo}
                          onChange={e => setAccNo(e.target.value)}
                          required
                          className="h-11 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Atas Nama</label>
                        <Input
                          placeholder="Nama Penerima"
                          value={accName}
                          onChange={e => setAccName(e.target.value)}
                          required
                          className="h-11"
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="w-full mt-4 h-11 bg-accent hover:bg-accent/90"
                      disabled={submitting || !balance || balance.availableBalance < 50000}
                    >
                      {submitting ? 'Memproses...' : 'Cairkan Sekarang'}
                    </Button>
                  </form>
                </div>
              </div>

              {/* History */}
              <div className="lg:col-span-3 space-y-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    <History size={18} className="text-accent" /> Riwayat Pencairan
                  </h3>

                  <div className="space-y-3">
                    {loading
                      ? [1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
                      : history.length === 0
                        ? (
                          <div className="p-12 text-center border border-dashed border-border rounded-2xl text-muted-foreground text-sm italic">
                            Belum ada riwayat pencairan.
                          </div>
                        )
                        : history.map(wd => (
                          <div key={wd.id} className="p-4 rounded-xl border border-border bg-card hover:border-accent/30 transition-colors">
                            {/* Main row */}
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className={`p-2 rounded-lg ${
                                  wd.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' :
                                  wd.status === 'REJECTED'  ? 'bg-rose-50 text-rose-600' :
                                  'bg-amber-50 text-amber-600'
                                }`}>
                                  {wd.status === 'COMPLETED' ? <CheckCircle2 size={20} /> :
                                   wd.status === 'REJECTED'  ? <XCircle size={20} /> :
                                   <Clock size={20} />}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-foreground font-mono">{formatIDR(wd.amount)}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {wd.bank_name} &bull; {wd.account_number} &bull; a.n. {wd.account_name}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                                  wd.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                  wd.status === 'REJECTED'  ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                  'bg-amber-50 text-amber-600 border-amber-100'
                                }`}>
                                  {wd.status}
                                </span>
                                <p className="text-[10px] text-muted-foreground mt-1">{formatDate(wd.created_at)}</p>
                              </div>
                            </div>

                            {/* Receipt link (COMPLETED with receipt) */}
                            {wd.status === 'COMPLETED' && wd.receipt_url && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <button
                                  onClick={() => setReceiptModal(wd.receipt_url!)}
                                  className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:underline"
                                >
                                  <ExternalLink size={12} /> Lihat Bukti Transfer
                                </button>
                              </div>
                            )}

                            {/* Rejection reason */}
                            {wd.status === 'REJECTED' && wd.rejected_reason && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <p className="text-xs text-rose-600">
                                  <span className="font-semibold">Alasan ditolak:</span> {wd.rejected_reason}
                                </p>
                              </div>
                            )}
                          </div>
                        ))
                    }
                  </div>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* Receipt Modal */}
      {receiptModal && <ReceiptModal url={receiptModal} onClose={() => setReceiptModal(null)} />}
    </div>
  )
}

/* ── Receipt Image Modal ───────────────────────────────────── */
function ReceiptModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-card rounded-2xl shadow-2xl p-5 max-w-lg w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-foreground">Bukti Transfer</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <XIcon size={18} />
          </button>
        </div>
        <img
          src={url}
          alt="Bukti Transfer"
          className="w-full rounded-xl border border-border object-contain max-h-[60vh]"
        />
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          <Download size={15} /> Unduh Bukti Transfer
        </a>
      </div>
    </div>
  )
}
