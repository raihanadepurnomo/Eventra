import { useState, useEffect } from 'react'
import { Search, Filter, AlertCircle, Clock, CheckCircle2, Trash2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { mapResaleListing } from '@/lib/mappers'
import { formatDate, formatIDR } from '@/lib/utils'
import type { ResaleListing } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'

export default function AdminResalePage() {
  const [listings, setListings] = useState<ResaleListing[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'SOLD' | 'CANCELLED' | 'EXPIRED'>('ALL')
  
  const [selectedListing, setSelectedListing] = useState<ResaleListing | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadListings()
  }, [])

  async function loadListings() {
    setLoading(true)
    try {
      const raw: any = await api.get('/resale/admin/listings')
      setListings(raw.map(mapResaleListing))
    } catch (err: any) {
      toast.error('Gagal memuat daftar resale')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Apakah Anda yakin ingin mematikan listing ini secara paksa? Tiket akan kembali ke ACTIVE.')) return
    
    setDeleting(id)
    try {
      await api.delete(`/resale/listings/${id}`)
      toast.success('Listing berhasil dimatikan')
      await loadListings()
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus listing')
    } finally {
      setDeleting(null)
    }
  }

  const filtered = listings.filter(l => {
    const matchesSearch = l.eventTitle?.toLowerCase().includes(search.toLowerCase()) || 
                         l.sellerName?.toLowerCase().includes(search.toLowerCase()) || 
                         l.sellerUsername?.toLowerCase().includes(search.toLowerCase()) ||
                         l.id.includes(search)
    const matchesFilter = filter === 'ALL' || l.status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Pasar Resale Resmi</h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Superadmin</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-foreground font-title tracking-tight">Monitoring Marketplace</h2>
              <p className="text-sm text-muted-foreground">Monitor semua transaksi tiket sekunder di seluruh platform Eventra.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input 
                  className="pl-10 h-11" 
                  placeholder="Cari event, penjual, atau ID listing..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                 <Filter size={16} className="text-muted-foreground" />
                 <select 
                    className="h-11 px-4 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus:ring-2 focus:ring-accent"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as any)}
                 >
                    <option value="ALL">Semua Status</option>
                    <option value="OPEN">Open (Aktif)</option>
                    <option value="SOLD">Sold (Terjual)</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="EXPIRED">Expired</option>
                 </select>
              </div>
            </div>

            <div className="grid gap-4">
              {loading ? (
                  [1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)
              ) : filtered.length === 0 ? (
                  <div className="p-20 text-center border border-dashed border-border rounded-2xl bg-muted/5 opacity-50">
                      Tidak ada data resale yang ditemukan.
                  </div>
              ) : (
                  filtered.map(listing => (
                      <AdminListingCard 
                          key={listing.id} 
                          listing={listing} 
                          onView={() => setSelectedListing(listing)}
                          onDelete={() => handleDelete(listing.id)}
                          isDeleting={deleting === listing.id}
                      />
                  ))
              )}
            </div>
          </div>
        </main>
      </div>

      <Dialog open={!!selectedListing} onOpenChange={(open) => !open && setSelectedListing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Penjualan Tiket</DialogTitle>
          </DialogHeader>
          {selectedListing && (
             <div className="space-y-6 pt-4">
                <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center font-bold text-accent">
                            {selectedListing.eventTitle?.[0]}
                        </div>
                        <div>
                            <p className="font-bold text-foreground text-sm uppercase leading-none mb-1">{selectedListing.eventTitle}</p>
                            <p className="text-[10px] text-muted-foreground">{selectedListing.ticketTypeName} • {selectedListing.id}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 px-2">
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Penjual</p>
                        <div>
                            <p className="font-bold text-sm text-foreground">{selectedListing.sellerName}</p>
                            <p className="text-xs text-accent font-bold">@{selectedListing.sellerUsername}</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Finansial</p>
                        <div>
                            <p className="text-sm">Harga: <strong className="font-mono text-foreground">{formatIDR(selectedListing.askingPrice)}</strong></p>
                            <p className="text-xs text-destructive">Fee (5%): <span className="font-mono">-{formatIDR(selectedListing.platformFee)}</span></p>
                        </div>
                    </div>
                </div>

                <div className="px-2 pt-4 border-t border-border space-y-3">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Status & Waktu</p>
                    <div className="flex flex-wrap gap-4 text-xs text-foreground">
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-muted-foreground" />
                            <span>Listed: {formatDate(selectedListing.listedAt)}</span>
                        </div>
                        {selectedListing.soldAt && (
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-emerald-500" />
                                <span>Sold: {formatDate(selectedListing.soldAt)}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <AlertCircle size={14} className="text-amber-500" />
                            <span>Expired: {formatDate(selectedListing.expiredAt)}</span>
                        </div>
                    </div>
                </div>

                {selectedListing.note && (
                    <div className="p-3 bg-muted/30 rounded-lg text-xs italic text-muted-foreground leading-relaxed">
                        "{selectedListing.note}"
                    </div>
                )}
             </div>
          )}
          <DialogFooter className="pt-6">
             <Button variant="outline" className="w-full" onClick={() => setSelectedListing(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminListingCard({ listing, onView, onDelete, isDeleting }: { listing: ResaleListing; onView: () => void; onDelete: () => void; isDeleting: boolean }) {
    const statusStyles = {
        OPEN: 'bg-blue-50 text-blue-600 border-blue-200',
        SOLD: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        CANCELLED: 'bg-amber-50 text-amber-600 border-amber-200',
        EXPIRED: 'bg-muted text-muted-foreground border-border'
    }

    return (
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-accent/40 transition-colors">
            <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="hidden sm:flex w-12 h-12 rounded-xl bg-muted items-center justify-center font-bold text-muted-foreground">
                    {listing.eventTitle?.[0]}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-foreground truncate">{listing.eventTitle}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${statusStyles[listing.status]}`}>
                            {listing.status}
                        </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-bold uppercase tracking-wider text-accent">{listing.ticketTypeName}</span>
                        <span>Dijual oleh: <strong className="text-foreground">@{listing.sellerUsername}</strong></span>
                        <span className="bg-muted/40 px-1.5 rounded">{listing.id}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-8 shrink-0">
                <div className="text-right">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Harga Jual</p>
                    <p className="font-mono font-bold text-foreground text-lg">{formatIDR(listing.askingPrice)}</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-9 w-9 p-0 rounded-full hover:bg-accent/10 hover:text-accent"
                      onClick={onView}
                    >
                        <Eye size={18} />
                    </Button>
                    
                    {listing.status === 'OPEN' && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-9 w-9 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
                          onClick={onDelete}
                          disabled={isDeleting}
                        >
                            <Trash2 size={18} />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}

