import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Indonesian Rupiah.
 * e.g. 350000 → "Rp 350.000"
 */
export function formatIDR(amount: number): string {
  return (
    'Rp ' +
    Math.round(amount)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  )
}

/**
 * Format an ISO date string to a localized Indonesian date.
 * e.g. "2025-06-06T..." → "6 Juni 2025"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '-'
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

/**
 * Format a date+time range for display.
 * If same day: "6 Juni 2025, 09:00 – 17:00"
 * If different days: "6 Juni 2025 – 7 Juni 2025"
 */
export function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)

  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate()

  if (sameDay) {
    const day = formatDate(start)
    const startTime = startDate.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    })
    const endTime = endDate.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${day}, ${startTime} – ${endTime}`
  }

  return `${formatDate(start)} – ${formatDate(end)}`
}

/**
 * Generate a random ID with a given prefix.
 * e.g. generateId('evt') → "evt_k3nd9a2b"
 */
export function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix}_${result}`
}

/**
 * Generate a UUID v4-like string suitable for QR codes.
 */
export function generateQRCode(): string {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  return `${s4()}${s4()}-${s4()}-4${s4().slice(1)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${s4().slice(1)}-${s4()}${s4()}${s4()}`
}

/**
 * Map an event category string to a Tailwind color class pair (bg + text).
 */
export function getEventCategoryColor(category: string): string {
  const map: Record<string, string> = {
    Music: 'bg-purple-100 text-purple-700',
    Concert: 'bg-purple-100 text-purple-700',
    Festival: 'bg-pink-100 text-pink-700',
    Conference: 'bg-blue-100 text-blue-700',
    Seminar: 'bg-blue-100 text-blue-700',
    Workshop: 'bg-orange-100 text-orange-700',
    Sports: 'bg-green-100 text-green-700',
    Exhibition: 'bg-yellow-100 text-yellow-700',
    Theater: 'bg-red-100 text-red-700',
    Comedy: 'bg-yellow-100 text-yellow-700',
    Food: 'bg-amber-100 text-amber-700',
    Tech: 'bg-cyan-100 text-cyan-700',
    Technology: 'bg-cyan-100 text-cyan-700',
    Art: 'bg-rose-100 text-rose-700',
    Education: 'bg-indigo-100 text-indigo-700',
    Networking: 'bg-teal-100 text-teal-700',
    Other: 'bg-gray-100 text-gray-700',
  }

  return map[category] ?? 'bg-gray-100 text-gray-700'
}
