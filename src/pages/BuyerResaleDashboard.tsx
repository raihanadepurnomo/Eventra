import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Tag, Clock, CheckCircle2, XCircle, AlertCircle, ShoppingBag, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { api } from '@/lib/api'
import { mapResaleListing } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR } from '@/lib/utils'
import type { ResaleListing } from '@/types'

export default function BuyerResaleDashboard() {
  const { dbUser } = useAuth()
  const [listings, setListings] = useState<ResaleListing[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  useEffect(() => {
    if (dbUser) loadListings()
  }, [dbUser])

  async function loadListings() {
    setLoading(true)
    try {
      const raw: any = await api.get(`/resale/listings?seller_id=${dbUser?.id}`)
      setListings(raw.map(mapResaleListing))
    } catch (err: any) {
      toast.error('Gagal memuat daftar penjualan')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Apakah Anda yakin ingin membatalkan listing ini? Tiket Anda akan kembali menjadi ACTIVE.')) return
    
    setCancelling(id)
    try {
      await api.delete(`/resale/listings/${id}`)
      toast.success('Listing berhasil dibatalkan')
      await loadListings()
    } catch (err: any) {
      toast.error(err.message || 'Gagal membatalkan listing')
    } finally {
      setCancelling(null)
    }
  }

  const activeListings = listings.filter(l => l.status === 'OPEN')
  const historyListings = listings.filter(l => l.status !== 'OPEN')

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
              <h1 className="text-2xl font-bold text-foreground">Tiket yang Kujual</h1>
              <p className="text-sm text-muted-foreground">Kelola semua tiket yang Anda daftarkan di pasar resale resmi.</p>
            </div>
            
            <Link to="/dashboard/balance">
              <Button variant="outline" className="gap-2">
                <ShoppingBag size={18} /> Lihat Saldo & Pencairan
              </Button>
            </Link>
          </div>

          <div className="space-y-12">
            {/* Active Listings */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-accent mb-4">
                <Tag size={18} /> Listing Aktif ({activeListings.length})
              </div>
              
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-32 rounded-2xl" />
                  <Skeleton className="h-32 rounded-2xl" />
                </div>
              ) : activeListings.length === 0 ? (
                <div className="p-12 border border-dashed border-border rounded-2xl text-center bg-muted/5">
                   <AlertCircle size={32} className="mx-auto text-muted-foreground mb-4 opacity-20" />
                   <p className="font-semibold text-foreground italic opacity-50">Belum ada listing aktif.</p>
                   <Link to="/dashboard" className="text-xs text-accent hover:underline mt-2 inline-block font-bold uppercase tracking-wider">Mulai jual tiket</Link>
                </div>
              ) : (
                <div className="grid gap-4">
                  {activeListings.map(listing => (
                    <ResaleItemCard 
                      key={listing.id} 
                      listing={listing} 
                      onCancel={() => handleCancel(listing.id)} 
                      isCancelling={cancelling === listing.id}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* History */}
            {historyListings.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
                  <Clock size={18} /> Riwayat Penjualan
                </div>
                <div className="grid gap-3 opacity-60 hover:opacity-100 transition-opacity">
                   {historyListings.map(listing => (
                      <div key={listing.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                         <div className="min-w-0 flex-1 pr-4">
                            <p className="font-bold text-foreground truncate">{listing.eventTitle || 'Event'}</p>
                            <p className="text-xs text-muted-foreground">{listing.ticketTypeName} • {formatDate(listing.listedAt)}</p>
                         </div>
                         <div className="text-right shrink-0">
                            {listing.status === 'SOLD' ? (
                               <div className="flex flex-col items-end">
                                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={12} /> TERJUAL</span>
                                  <span className="font-mono text-sm font-bold">{formatIDR(listing.sellerReceives)}</span>
                               </div>
                            ) : (
                               <div className="flex flex-col items-end">
                                  <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><XCircle size={12} /> {listing.status}</span>
                                  <span className="font-mono text-xs line-through text-muted-foreground">{formatIDR(listing.askingPrice)}</span>
                               </div>
                            )}
                         </div>
                      </div>
                   ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function ResaleItemCard({ listing, onCancel, isCancelling }: { listing: ResaleListing; onCancel: () => void; isCancelling: boolean }) {
  const diff = new Date(listing.expiredAt).getTime() - Date.now()
  const hoursLeft = diff / (1000 * 60 * 60)
  const daysLeft = Math.ceil(hoursLeft / 24)
  
  const timeText = hoursLeft > 24 
    ? `${daysLeft} hari` 
    : hoursLeft > 1 
      ? `${Math.floor(hoursLeft)} jam` 
      : `${Math.max(0, Math.floor(hoursLeft * 60))} menit`

  return (
    <div className="group relative bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
      <div className="p-6">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          <div className="flex-1 space-y-3">
             <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg text-foreground leading-tight">{listing.eventTitle || 'Event Terkait'}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{listing.ticketTypeName}</p>
                </div>
                <div className="bg-amber-500/10 text-amber-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-amber-500/20">
                   {listing.status}
                </div>
             </div>

             <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-2">
                <div>
                   <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Harga Jual</p>
                   <p className="font-mono font-bold text-foreground">{formatIDR(listing.askingPrice)}</p>
                </div>
                <div>
                   <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Platform Fee (5%)</p>
                   <p className="font-mono text-destructive text-sm">-{formatIDR(listing.platformFee)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                   <p className="text-[10px] uppercase font-bold text-accent mb-1">Pendapatan Bersih</p>
                   <p className="font-mono font-bold text-accent text-lg">{formatIDR(listing.sellerReceives)}</p>
                </div>
             </div>
             
             {listing.note && (
                <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded-lg border border-border/50">
                  "{listing.note}"
                </p>
             )}
          </div>

          <div className="md:w-56 flex flex-col justify-between border-t md:border-t-0 md:border-l border-border pt-6 md:pt-0 md:pl-6 space-y-4">
             <div className="flex items-center gap-2 text-xs">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">Berakhir dalam <strong className="text-foreground">{timeText}</strong></span>
             </div>
             
             <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20 transition-all font-bold"
                  onClick={onCancel}
                  disabled={isCancelling}
                >
                   {isCancelling ? 'Membatalkan...' : 'Batalkan Penjualan'}
                </Button>
                <Link to="/events" className="block">
                   <Button variant="ghost" size="sm" className="w-full text-[10px] uppercase font-bold tracking-widest gap-1.5 opacity-60 hover:opacity-100">
                      Lihat Listing <ExternalLink size={12} />
                   </Button>
                </Link>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
