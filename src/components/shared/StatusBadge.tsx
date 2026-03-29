import { cn } from '@/lib/utils'
import type { EOStatus, EventStatus, OrderStatus, TicketStatus, ResaleStatus } from '@/types'

type BadgeStatus = EOStatus | EventStatus | OrderStatus | TicketStatus | ResaleStatus | string

interface StatusBadgeProps {
  status: BadgeStatus
  className?: string
}

interface StatusConfig {
  label: string
  className: string
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  // Pending / warning
  PENDING:          { label: 'Menunggu',     className: 'bg-amber-50 text-amber-700 border-amber-200' },

  // Active / success states
  ACTIVE:           { label: 'Aktif',        className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ACTIVE_TICKET:    { label: 'Aktif',        className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PAID:             { label: 'Lunas',        className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  COMPLETED:        { label: 'Selesai',      className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SOLD:             { label: 'Terjual',      className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },

  // Indigo / published
  PUBLISHED:        { label: 'Publik',       className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  OPEN:             { label: 'Tersedia',     className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },

  // Red — error / blocked
  SUSPENDED:        { label: 'Ditangguhkan', className: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED:        { label: 'Dibatalkan',   className: 'bg-red-50 text-red-700 border-red-200' },

  // Gray — neutral
  DRAFT:            { label: 'Draft',        className: 'bg-gray-50 text-gray-600 border-gray-200' },
  EXPIRED:          { label: 'Kedaluwarsa',  className: 'bg-gray-50 text-gray-500 border-gray-200' },
  USED:             { label: 'Digunakan',    className: 'bg-gray-50 text-gray-500 border-gray-200' },
  TRANSFERRED:      { label: 'Telah Terjual', className: 'bg-sky-50 text-sky-700 border-sky-200' },

  // Blue — special
  REFUNDED:         { label: 'Dikembalikan', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  LISTED_FOR_RESALE:{ label: 'Dijual',       className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: StatusConfig = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-gray-50 text-gray-600 border-gray-200',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
