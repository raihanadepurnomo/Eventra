import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { TicketType } from '@/types'
import { formatIDR } from '@/lib/utils'

interface TicketTypeRowProps {
  ticketType: TicketType
  quantity: number
  onQuantityChange: (id: string, qty: number) => void
}

function isSaleActive(tt: TicketType): boolean {
  const now = Date.now()
  const start = new Date(tt.saleStartDate).getTime()
  const end = new Date(tt.saleEndDate).getTime()
  return now >= start && now <= end
}

export function TicketTypeRow({ ticketType: tt, quantity, onQuantityChange }: TicketTypeRowProps) {
  const remaining = tt.quota - tt.sold
  const soldOut = remaining <= 0
  const saleActive = isSaleActive(tt)
  const disabled = soldOut || !saleActive

  const decrement = () => onQuantityChange(tt.id, Math.max(0, quantity - 1))
  const increment = () => onQuantityChange(tt.id, Math.min(tt.maxPerOrder, quantity + 1))

  return (
    <div className={`p-3 rounded-lg border ${disabled ? 'border-border bg-muted/30 opacity-60' : 'border-border bg-background'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{tt.name}</p>
          {tt.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tt.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {tt.price === 0 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                GRATIS
              </span>
            ) : (
              <span className="text-sm font-bold text-foreground font-mono">{formatIDR(tt.price)}</span>
            )}
            {soldOut ? (
              <span className="text-xs text-destructive font-medium">Habis Terjual</span>
            ) : !saleActive ? (
              <span className="text-xs text-muted-foreground">Penjualan belum aktif</span>
            ) : (
              <span className="text-xs text-muted-foreground">{remaining} tersisa</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={decrement}
            disabled={disabled || quantity === 0}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-6 text-center text-sm font-semibold text-foreground tabular-nums">
            {quantity}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={increment}
            disabled={disabled || quantity >= tt.maxPerOrder || quantity >= remaining}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
