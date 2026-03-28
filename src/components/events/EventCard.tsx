import { Calendar, MapPin } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { Event, TicketType } from '@/types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatDate, formatIDR } from '@/lib/utils'

interface EventCardProps {
  event: Event
  ticketTypes?: TicketType[]
  showStatus?: boolean
  className?: string
}

export function EventCard({
  event,
  ticketTypes,
  showStatus,
  className,
}: EventCardProps) {
  const minPrice =
    ticketTypes && ticketTypes.length > 0
      ? Math.min(...ticketTypes.map((t) => t.price))
      : null

  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      className={cn(
        'group block bg-card rounded-xl border border-border overflow-hidden',
        'hover:shadow-md transition-all duration-200 hover:-translate-y-0.5',
        className
      )}
    >
      {/* Banner */}
      <div className="relative h-44 bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden">
        {event.bannerImage ? (
          <img
            src={event.bannerImage}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" />
          </div>
        )}
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Category pill */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-white/90 text-xs font-semibold text-foreground">
            {event.category}
          </span>
        </div>

        {/* Status badge */}
        {showStatus && (
          <div className="absolute top-3 right-3">
            <StatusBadge status={event.status} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-foreground text-sm leading-snug mb-2.5 line-clamp-2 group-hover:text-accent transition-colors">
          {event.title}
        </h3>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar size={12} />
            <span>{formatDate(event.startDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin size={12} />
            <span className="truncate">{event.location}</span>
          </div>
        </div>

        {minPrice !== null && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Mulai dari</span>
            {minPrice === 0 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                GRATIS
              </span>
            ) : (
              <span className="text-sm font-bold text-foreground font-mono">{formatIDR(minPrice)}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
