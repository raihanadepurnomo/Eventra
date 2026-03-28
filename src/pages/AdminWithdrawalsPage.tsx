import { useState, useEffect } from 'react'
import { Landmark, Clock, CheckCircle2, XCircle, Search, Filter, AlertCircle, Info, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { mapWithdrawal } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR } from '@/lib/utils'
import type { Withdrawal } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { Label } from '@/components/ui/Label'
import { Textarea } from '@/components/ui/Textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Wallet } from 'lucide-react'

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('withdrawals')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'>('ALL')
  
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null)
  const [pendingStatus, setPendingStatus] = useState<string>('')
  const [adminNote, setAdminNote] = useState('')
  const [rejectedReason, setRejectedReason] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)

  // Reset modal state when new withdrawal is selected
  useEffect(() => {
    if (selectedWithdrawal) {
      setPendingStatus(selectedWithdrawal.status)
      setAdminNote(selectedWithdrawal.adminNote || '')
      setRejectedReason(selectedWithdrawal.rejectedReason || '')
      setReceiptFile(null)
    }
  }, [selectedWithdrawal])

  useEffect(() => {
    if (activeTab === 'withdrawals') {
      loadWithdrawals()
    } else {
      loadBalances()
    }
  }, [activeTab])

  async function loadWithdrawals() {
    setLoading(true)
    try {
      const raw: any = await api.get('/resale/admin/withdrawals')
      setWithdrawals(raw.map(mapWithdrawal))
    } catch (err: any) {
      toast.error('Gagal memuat permintaan pencairan')
    } finally {
      setLoading(false)
    }
  }

  async function loadBalances() {
    setLoading(true)
    try {
      const data: any = await api.get('/resale/admin/balances')
      setBalances(data)
    } catch (err: any) {
      toast.error('Gagal memuat daftar saldo')
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    if (status === 'COMPLETED' && !receiptFile && !adminNote) {
      // Small check or just allow it? User said "taro aja", but usually receipt is required for Completed
    }

    setStatusUpdating(true)
    try {
      const formData = new FormData()
      formData.append('status', status)
      formData.append('admin_note', adminNote)
      formData.append('rejected_reason', status === 'REJECTED' ? rejectedReason : '')
      formData.append('account_name', selectedWithdrawal?.accountName || '')
      if (receiptFile) {
        formData.append('receipt', receiptFile)
      }

      await api.put(`/resale/admin/withdrawals/${id}`, formData)

      toast.success(`Berhasil memperbarui status menjadi ${status}`)
      setSelectedWithdrawal(null)
      await loadWithdrawals()
    } catch (err: any) {
      toast.error(err.message || 'Gagal memperbarui status')
    } finally {
      setStatusUpdating(false)
    }
  }

  const filtered = withdrawals.filter(w => {
    const matchesSearch = w.userName?.toLowerCase().includes(search.toLowerCase()) || 
                         w.userEmail?.toLowerCase().includes(search.toLowerCase()) || 
                         w.bankName.toLowerCase().includes(search.toLowerCase()) || 
                         w.accountNumber.includes(search)
    const matchesFilter = filter === 'ALL' || w.status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Keuangan & Pencairan</h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Superadmin</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-foreground">Manajemen Dana</h2>
              <p className="text-sm text-muted-foreground">Kelola perputaran dana, saldo penjual, dan pencairan dana resale.</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="bg-muted/50 p-1 rounded-xl w-full sm:w-auto overflow-x-auto inline-flex whitespace-nowrap">
                <TabsTrigger value="withdrawals" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:text-accent data-[state=active]:shadow-sm gap-2">
                  <Landmark size={14} /> Permintaan Pencairan
                </TabsTrigger>
                <TabsTrigger value="balances" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:text-accent data-[state=active]:shadow-sm gap-2">
                  <Wallet size={14} /> Daftar Saldo Penjual
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input 
                    className="pl-10" 
                    placeholder={activeTab === 'withdrawals' ? "Cari user, email, bank, atau rekening..." : "Cari nama atau email penjual..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {activeTab === 'withdrawals' && (
                  <div className="flex items-center gap-2">
                    <Filter size={16} className="text-muted-foreground" />
                    <select 
                        className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                    >
                        <option value="ALL">Semua Status</option>
                        <option value="PENDING">Pending (Tunggu)</option>
                        <option value="PROCESSING">Processing (Sedang Diproses)</option>
                        <option value="COMPLETED">Completed (Selesai)</option>
                        <option value="REJECTED">Rejected (Ditolak)</option>
                    </select>
                  </div>
                )}
              </div>

              <TabsContent value="withdrawals" className="m-0">
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted/30 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-6 py-4">Pengguna</th>
                            <th className="px-6 py-4">Bank & Rekening</th>
                            <th className="px-6 py-4">Nominal</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Dibuat</th>
                            <th className="px-6 py-4 text-right">Aksi</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                          {loading ? (
                            [1,2,3,4,5].map(i => (
                                <tr key={i}><td colSpan={6} className="px-6 py-4"><Skeleton className="h-12 w-full rounded-lg" /></td></tr>
                            ))
                          ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-20 text-center text-muted-foreground">Tidak ada data penarikan.</td></tr>
                          ) : (
                            filtered.map(wd => (
                                <tr key={wd.id} className="hover:bg-muted/5 transition-colors">
                                  <td className="px-6 py-4">
                                      <div className="font-bold text-foreground">{wd.userName || 'Unknown'}</div>
                                      <div className="text-[10px] text-muted-foreground">{wd.userEmail}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="font-bold text-foreground">{wd.bankName}</div>
                                      <div className="text-[10px] text-muted-foreground tracking-widest">{wd.accountNumber}</div>
                                      <div className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5">{wd.accountName}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="font-mono font-bold text-accent">{formatIDR(wd.amount)}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <StatusTag status={wd.status} />
                                  </td>
                                  <td className="px-6 py-4 text-muted-foreground text-[10px]">
                                      <div className="flex flex-col gap-1">
                                        <span>{formatDate(wd.createdAt)}</span>
                                        {wd.receiptUrl && (
                                          <a 
                                            href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/../${wd.receiptUrl.startsWith('/') ? wd.receiptUrl.slice(1) : wd.receiptUrl}`} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="text-accent hover:underline flex items-center gap-1 font-bold"
                                          >
                                            <ExternalLink size={10} /> Lihat Resi
                                          </a>
                                        )}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="h-8 text-xs font-bold border-accent/20 text-accent hover:bg-accent hover:text-white"
                                        onClick={() => setSelectedWithdrawal(wd)}
                                      >
                                        Update
                                      </Button>
                                  </td>
                                </tr>
                            ))
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="balances" className="m-0">
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted/30 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-6 py-4">Penjual</th>
                          <th className="px-6 py-4">Total Pendapatan</th>
                          <th className="px-6 py-4">Sudah Dicairkan</th>
                          <th className="px-6 py-4 text-accent">Saldo Tersedia</th>
                          <th className="px-6 py-4">Update Terakhir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {loading ? (
                          [1,2,3,4,5].map(i => (
                            <tr key={i}><td colSpan={5} className="px-6 py-4"><Skeleton className="h-12 w-full rounded-lg" /></td></tr>
                          ))
                        ) : balances.filter(b => b.user_name?.toLowerCase().includes(search.toLowerCase()) || b.user_email?.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-20 text-center text-muted-foreground">Tidak ada data saldo penjual.</td></tr>
                        ) : (
                          balances
                            .filter(b => b.user_name?.toLowerCase().includes(search.toLowerCase()) || b.user_email?.toLowerCase().includes(search.toLowerCase()))
                            .map(b => (
                              <tr key={b.id} className="hover:bg-muted/5 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <div className="font-bold text-foreground">{b.user_name || 'Unknown'}</div>
                                      <div className="text-[10px] text-muted-foreground">{b.user_email}</div>
                                    </div>
                                    {b.user_role === 'EO' && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent/10 text-accent border border-accent/20">EO</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="font-mono text-muted-foreground">{formatIDR(b.total_earned)}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="font-mono text-muted-foreground">{formatIDR(b.total_withdrawn)}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="font-mono font-bold text-accent text-lg">{formatIDR(b.balance)}</div>
                                </td>
                                <td className="px-6 py-4 text-muted-foreground text-[10px]">
                                  {formatDate(b.updated_at)}
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => !open && setSelectedWithdrawal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Status Pencairan</DialogTitle>
          </DialogHeader>
          {selectedWithdrawal && (
             <div className="space-y-6 pt-4">
                <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-4">
                   <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                         <p className="text-muted-foreground uppercase font-bold tracking-tighter mb-1">Penerima</p>
                         <p className="font-bold text-foreground">{selectedWithdrawal.userName}</p>
                         <p className="text-muted-foreground">{selectedWithdrawal.userEmail}</p>
                      </div>
                      <div>
                         <p className="text-muted-foreground uppercase font-bold tracking-tighter mb-1">Nominal</p>
                         <p className="font-mono font-bold text-accent text-lg">{formatIDR(selectedWithdrawal.amount)}</p>
                      </div>
                   </div>
                   <div className="pt-3 border-t border-border/50">
                      <p className="text-muted-foreground uppercase font-bold tracking-tighter mb-1">Informasi Bank</p>
                      <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded-lg bg-white border border-border flex items-center justify-center font-bold text-accent text-xs">
                            {selectedWithdrawal.bankName.slice(0,3)}
                         </div>
                         <div>
                            <p className="font-bold text-foreground">{selectedWithdrawal.bankName} — {selectedWithdrawal.accountNumber}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none mt-0.5">a.n. {selectedWithdrawal.accountName}</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="space-y-2">
                      <Label>Status Pencairan</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                         {['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'].map(s => (
                            <button
                               key={s}
                               type="button"
                               onClick={() => setPendingStatus(s)}
                               disabled={statusUpdating}
                               className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${
                                  pendingStatus === s 
                                  ? 'bg-accent text-white border-accent shadow-sm scale-105' 
                                  : 'bg-card border-border hover:border-accent text-muted-foreground'
                               }`}
                            >
                               {s}
                            </button>
                         ))}
                      </div>
                      {pendingStatus !== selectedWithdrawal.status && (
                        <p className="text-[9px] text-accent font-bold italic animate-pulse">
                          * Status berubah (Belum tersimpan)
                        </p>
                      )}
                   </div>

                   <div className="space-y-2">
                      <Label>Catatan Admin (Untuk Internal)</Label>
                      <Textarea 
                        placeholder="Contoh: Sudah di-transfer via Flip, bukti terlampir di sistem..." 
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        className="h-20 text-xs"
                      />
                   </div>

                   <div className="space-y-2">
                      <Label className="text-destructive">Alasan Penolakan (Hanya jika REJECTED)</Label>
                      <Input 
                        placeholder="Contoh: Nomor rekening tidak valid / Nama tidak sesuai..." 
                        className="text-xs border-destructive/20 focus-visible:ring-destructive"
                        value={rejectedReason}
                        onChange={(e) => setRejectedReason(e.target.value)}
                      />
                   </div>

                   <div className="space-y-2">
                      <Label>Unggah Bukti Transfer (Opsional)</Label>
                      <div className="flex flex-col gap-2">
                        <Input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                          className="text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground italic">Maksimal 2MB. Format: JPG, PNG, JPEG.</p>
                        {selectedWithdrawal.receiptUrl && (
                           <div className="mt-2 p-2 border border-accent/20 rounded-lg bg-accent/5 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-accent">Resi Saat Ini Terlampir</span>
                              <a 
                                href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/../${selectedWithdrawal.receiptUrl.startsWith('/') ? selectedWithdrawal.receiptUrl.slice(1) : selectedWithdrawal.receiptUrl}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-[10px] text-accent underline flex items-center gap-1"
                              >
                                <ExternalLink size={10} /> Lihat
                              </a>
                           </div>
                        )}
                      </div>
                   </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 text-blue-800">
                   <Info size={18} className="shrink-0 mt-0.5" />
                   <p className="text-[10px] leading-relaxed">
                      Mengubah status ke <strong>REJECTED</strong> akan otomatis <strong>mengembalikan (refund)</strong> saldo ke dompet pengguna. Mengubah ke <strong>COMPLETED</strong> menunjukkan bahwa transfer manual telah berhasil dilakukan.
                   </p>
                </div>
             </div>
          )}
          <DialogFooter className="pt-6 gap-2">
             <Button variant="outline" className="flex-1" onClick={() => setSelectedWithdrawal(null)}>Batal</Button>
             <Button 
               className="flex-1 bg-accent text-accent-foreground font-bold" 
               disabled={statusUpdating || !selectedWithdrawal}
               onClick={() => selectedWithdrawal && updateStatus(selectedWithdrawal.id, pendingStatus)}
             >
               {statusUpdating ? 'Menyimpan...' : 'Simpan Perubahan'}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusTag({ status }: { status: Withdrawal['status'] }) {
   const styles = {
      PENDING: 'bg-amber-50 text-amber-600 border-amber-200',
      PROCESSING: 'bg-blue-50 text-blue-600 border-blue-200',
      COMPLETED: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      REJECTED: 'bg-destructive/5 text-destructive border-destructive/20'
   }
   return (
      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${styles[status]}`}>
         {status}
      </span>
   )
}

