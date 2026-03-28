import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatIDR } from '@/lib/utils'
import type { Order } from '@/types'

export default function BuyerOrdersPage() {
  const { dbUser } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!dbUser) return
    api.get(`/orders?user_id=${dbUser.id}`)
      .then((data) => {
        const mapped = Array.isArray(data) ? (data as any[]).map(mapOrder) : []
        setOrders(mapped)
      })
      .finally(() => setLoading(false))
  }, [dbUser])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-14">
        <div className="border-b border-border bg-secondary/30">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            <h1 className="text-2xl font-bold text-foreground">Riwayat Pesanan</h1>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground mb-1">Belum ada pesanan</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow">
                  <div>
                    <p className="text-xs font-mono text-muted-foreground mb-1">{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <StatusBadge status={order.status} />
                    <p className="text-sm font-bold font-mono text-foreground">{formatIDR(Number(order.totalAmount ?? 0))}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
