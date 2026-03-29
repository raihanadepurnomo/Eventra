import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Wallet, TrendingUp, Landmark, History, AlertCircle, CheckCircle2, XCircle, Clock, Info, Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { api } from '@/lib/api'
import { mapSellerBalance, mapSellerBalanceTransaction, mapWithdrawal } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR } from '@/lib/utils'
import type { SellerBalance, SellerBalanceTransaction, Withdrawal } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'

export default function BalanceDashboardPage() {
  const { dbUser } = useAuth()
  const [balance, setBalance] = useState<SellerBalance | null>(null)
  const [balanceTransactions, setBalanceTransactions] = useState<SellerBalanceTransaction[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [showWithdrawForm, setShowWithdrawForm] = useState(false)
  
  const [amount, setAmount] = useState('')
  const [bankName, setBankName] = useState('BCA')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (dbUser) loadData()
  }, [dbUser])

  function redirectToVerifyEmail() {
    if (!dbUser?.email) {
      toast.error('Harap login terlebih dahulu')
      return
    }

    const q = new URLSearchParams({ email: dbUser.email, type: 'verify_email', from: 'profile' })
    window.location.href = `/verify-otp?${q.toString()}`
  }

  async function loadData() {
    setLoading(true)
    try {
      const balRaw: any = await api.get('/resale/balance')
      setBalance(mapSellerBalance(balRaw))

      const txRaw: any[] = await api.get('/resale/balance/history')
      setBalanceTransactions(Array.isArray(txRaw) ? txRaw.map(mapSellerBalanceTransaction) : [])
      
      const wdRaw: any = await api.get(`/resale/admin/withdrawals?user_id=${dbUser?.id}`) // Fallback query for user's own WDs
      setWithdrawals(wdRaw.map(mapWithdrawal))
    } catch (err: any) {
      toast.error('Gagal memuat data keuangan')
    } finally {
      setLoading(false)
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault()
    if (!dbUser?.isEmailVerified) {
      redirectToVerifyEmail()
      return
    }
    const withdrawAmount = Number(amount)
    if (withdrawAmount < 50000) {
      toast.error('Minimal pencairan adalah Rp 50.000')
      return
    }
    if (balance && withdrawAmount > balance.balance) {
      toast.error('Saldo tidak mencukupi')
      return
    }

    setSubmitting(true)
    try {
      await api.post('/resale/balance/withdraw', {
        amount: withdrawAmount,
        bankName,
        accountNumber,
        accountName
      })
      toast.success('Permintaan pencairan berhasil diajukan!')
      setShowWithdrawForm(false)
      setAmount('')
      setAccountNumber('')
      setAccountName('')
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengajukan pencairan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="space-y-1">
              <Link 
                to="/dashboard" 
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
              >
                <ArrowLeft size={16} /> Kembali ke Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-foreground">Saldo Saya</h1>
              <p className="text-sm text-muted-foreground">Kelola pendapatan dari penjualan tiket resale Anda.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <BalanceCard 
              label="Saldo Tersedia" 
              value={balance?.balance || 0} 
              icon={<Wallet className="text-accent" />}
              loading={loading}
              highlight
            />
            <BalanceCard 
              label="Total Pendapatan" 
              value={balance?.totalEarned || 0} 
              icon={<TrendingUp className="text-emerald-500" />}
              loading={loading}
            />
            <BalanceCard 
              label="Sudah Dicairkan" 
              value={balance?.totalWithdrawn || 0} 
              icon={<Landmark className="text-muted-foreground" />}
              loading={loading}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                   <History size={18} /> Riwayat Transaksi
                </h2>
              </div>
              
              {loading ? (
                <div className="space-y-3">
                   <Skeleton className="h-16 rounded-xl" />
                   <Skeleton className="h-16 rounded-xl" />
                </div>
                ) : balanceTransactions.length === 0 && withdrawals.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-border rounded-2xl bg-muted/5">
                   <p className="text-sm text-muted-foreground">Belum ada riwayat transaksi atau pencairan.</p>
                </div>
              ) : (
                <div className="space-y-3">
                   {balanceTransactions.map((tx) => (
                     <BalanceTransactionRow key={tx.id} transaction={tx} />
                   ))}
                   {withdrawals.map(wd => (
                      <WithdrawalRow key={wd.id} withdrawal={wd} />
                   ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
               <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
                  <div className="space-y-2">
                     <h3 className="font-bold text-foreground">Aksi Keuangan</h3>
                     <p className="text-xs text-muted-foreground leading-relaxed">
                        Saldo pendapatan akan tersedia setiap kali tiket resale Anda terjual mulus di platform.
                     </p>
                  </div>
                  
                  <Button 
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-bold h-11"
                    onClick={() => setShowWithdrawForm(true)}
                    disabled={!balance || balance.balance < 50000 || !dbUser?.isEmailVerified}
                  >
                     Ajukan Pencairan
                  </Button>

                  {dbUser && !dbUser.isEmailVerified && (
                    <p className="text-[11px] text-amber-700 text-center">
                      Verifikasi email dulu untuk menarik saldo.{' '}
                      <button
                        type="button"
                        className="underline font-semibold"
                        onClick={redirectToVerifyEmail}
                      >
                        Verifikasi sekarang
                      </button>
                    </p>
                  )}
                  
                  {balance && balance.balance < 50000 && (
                    <p className="text-[10px] text-center text-muted-foreground italic">
                       * Minimal pencairan Rp 50.000
                    </p>
                  )}
                  
                  <div className="pt-6 border-t border-border space-y-3">
                     <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
                        <Info size={14} className="shrink-0" />
                        <p>Pencairan diproses manual oleh Admin dalam 1-3 hari kerja.</p>
                     </div>
                     <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
                        <Info size={14} className="shrink-0" />
                        <p>Pastikan data bank yang Anda masukkan sudah benar.</p>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      <Dialog open={showWithdrawForm} onOpenChange={setShowWithdrawForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tarik Saldo ke Rekening</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWithdraw} className="space-y-4 pt-4">
             <div className="space-y-2">
                <Label>Jumlah Pencairan (Rp)</Label>
                <div className="relative">
                   <Input 
                      type="number" 
                      className="pl-12 font-mono font-bold"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Contoh: 100000"
                      required
                   />
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Rp</span>
                </div>
                <div className="flex justify-between text-[10px]">
                   <span className="text-muted-foreground">Min. Rp 50.000</span>
                   <span className="text-accent font-bold cursor-pointer" onClick={() => setAmount(String(balance?.balance || 0))}>Pencairan Maksimal</span>
                </div>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label>Bank</Label>
                   <select 
                      className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                   >
                      <option value="BCA">BCA</option>
                      <option value="Mandiri">Mandiri</option>
                      <option value="BNI">BNI</option>
                      <option value="BRI">BRI</option>
                      <option value="Danamon">Danamon</option>
                      <option value="Permata">Permata</option>
                      <option value="CIMB Niaga">CIMB Niaga</option>
                   </select>
                </div>
                <div className="space-y-2">
                   <Label>Nomor Rekening</Label>
                   <Input 
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="0000-0000-00"
                      required
                   />
                </div>
             </div>

             <div className="space-y-2">
                <Label>Atas Nama Pemilik Rekening</Label>
                <Input 
                   value={accountName}
                   onChange={(e) => setAccountName(e.target.value)}
                   placeholder="Nama lengkap di buku tabungan"
                   required
                />
             </div>

             <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-3 text-amber-800">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed">
                   <strong>Mohon teliti:</strong> Segala kesalahan nomor rekening atau nama bank dapat menghambat proses pencairan atau menyebabkan dana terkirim ke pihak yang salah.
                </p>
             </div>

             <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setShowWithdrawForm(false)}>Batal</Button>
                <Button 
                   type="submit" 
                   className="bg-accent text-accent-foreground font-bold"
                   disabled={submitting || !dbUser?.isEmailVerified}
                >
                   {submitting ? 'Memproses...' : 'Ajukan Pencairan'}
                </Button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BalanceCard({ label, value, icon, highlight = false, loading = false }: { label: string; value: number; icon: React.ReactNode; highlight?: boolean; loading?: boolean }) {
  if (loading) return <Skeleton className="h-32 rounded-2xl" />
  
  return (
    <div className={`p-6 rounded-2xl border border-border shadow-sm flex flex-col justify-between ${highlight ? 'bg-accent/5 ring-1 ring-accent/20' : 'bg-card'}`}>
       <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
          <div className="w-8 h-8 rounded-full bg-muted/20 flex items-center justify-center">
             {icon}
          </div>
       </div>
       <p className={`text-xl font-mono font-bold ${highlight ? 'text-accent' : 'text-foreground'}`}>
          {formatIDR(value)}
       </p>
    </div>
  )
}

function BalanceTransactionRow({ transaction }: { transaction: SellerBalanceTransaction }) {
  const labels: Record<string, string> = {
    RESALE_SOLD: 'Pendapatan Penjualan Resale',
    LISTING_EXPIRED_COMPENSATION: 'Kompensasi Listing Resale Expired',
  }

  const label = labels[transaction.type] || (transaction.description || 'Penambahan Saldo')

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
          <TrendingUp size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">{formatDate(transaction.createdAt)}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <p className="font-mono text-sm font-bold text-emerald-700">+{formatIDR(transaction.amount)}</p>
        <div className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 bg-emerald-100">
          <CheckCircle2 size={12} /> Kredit
        </div>
      </div>
    </div>
  )
}

function WithdrawalRow({ withdrawal }: { withdrawal: Withdrawal }) {
  const statusMap = {
    PENDING: { label: 'Tunggu', icon: <Clock size={12} />, className: 'bg-amber-50 text-amber-600 border-amber-200' },
    PROCESSING: { label: 'Proses', icon: <Clock size={12} />, className: 'bg-blue-50 text-blue-600 border-blue-200' },
    COMPLETED: { label: 'Selesai', icon: <CheckCircle2 size={12} />, className: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    REJECTED: { label: 'Ditolak', icon: <XCircle size={12} />, className: 'bg-destructive/5 text-destructive border-destructive/20' }
  }
  const status = statusMap[withdrawal.status]

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/50 hover:bg-card transition-colors">
       <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
             <Landmark size={18} />
          </div>
          <div className="min-w-0">
             <p className="text-xs font-bold text-foreground">Pencairan ke {withdrawal.bankName}</p>
             <p className="text-[10px] text-muted-foreground">{formatDate(withdrawal.createdAt)} • {withdrawal.accountNumber}</p>
          </div>
       </div>
       <div className="flex flex-col items-end gap-1.5 shrink-0">
          <p className="font-mono text-sm font-bold text-foreground">-{formatIDR(withdrawal.amount)}</p>
          <div className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${status.className}`}>
             {status.icon} {status.label}
          </div>
          {withdrawal.receiptUrl && (
             <a 
               href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/../${withdrawal.receiptUrl.startsWith('/') ? withdrawal.receiptUrl.slice(1) : withdrawal.receiptUrl}`}
               target="_blank"
               rel="noreferrer"
               download
               className="flex items-center gap-1 text-[8px] font-bold text-accent hover:underline uppercase tracking-tighter"
             >
               <Download size={10} /> Bukti Transfer
             </a>
          )}
       </div>
    </div>
  )
}
