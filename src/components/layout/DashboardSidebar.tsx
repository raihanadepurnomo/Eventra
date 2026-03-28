import { Link } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Calendar,
  Plus,
  Users,
  Receipt,
  Ticket,
  LogOut,
  BarChart2,
  QrCode,
  FileText,
  Landmark,
  ShoppingBag
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const eoNav: NavItem[] = [
  { label: 'Beranda',    href: '/eo/dashboard',     icon: LayoutDashboard },
  { label: 'Event Saya', href: '/eo/events',        icon: Calendar },
  { label: 'Buat Event', href: '/eo/events/create', icon: Plus },
  { label: 'Peserta',     href: '/eo/attendees',     icon: Users },
  { label: 'Scan Tiket',  href: '/eo/scanner',        icon: QrCode },
  { label: 'Keuangan',    href: '/eo/finance',        icon: Landmark },
  { label: 'Laporan',     href: '/eo/reports',        icon: FileText },
]

const adminNav: NavItem[] = [
  { label: 'Beranda',     href: '/admin/dashboard',      icon: LayoutDashboard },
  { label: 'Kelola EO',  href: '/admin/eos',            icon: Users },
  { label: 'Semua Event', href: '/admin/events',         icon: Calendar },
  { label: 'Transaksi',   href: '/admin/transactions',   icon: Receipt },
  { label: 'Marketplace',   href: '/admin/resale',       icon: ShoppingBag },
  { label: 'Keuangan',    href: '/admin/withdrawals',    icon: Landmark },
  { label: 'Laporan',     href: '/admin/reports',        icon: FileText },
]

function SidebarLink({ item }: { item: NavItem }) {
  const isDashboard = item.href === '/eo/dashboard' || item.href === '/admin/dashboard'
  let isActive = window.location.pathname === item.href

  if (!isDashboard && !isActive && window.location.pathname.startsWith(item.href)) {
    // Special case: don't highlight "Event Saya" (/eo/events) when on "Buat Event" (/eo/events/create)
    if (item.href === '/eo/events' && window.location.pathname === '/eo/events/create') {
      isActive = false
    } else {
      isActive = true
    }
  }

  return (
    <Link
      to={item.href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <item.icon size={15} />
      {item.label}
    </Link>
  )
}

export function DashboardSidebar() {
  const { dbUser, logout } = useAuth()
  const isAdmin = dbUser?.role === 'SUPER_ADMIN'
  const navItems = isAdmin ? adminNav : eoNav

  return (
    <aside className="w-60 shrink-0 flex flex-col h-screen border-r border-border bg-background sticky top-0">

      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-14 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <Ticket size={14} className="text-white" />
        </div>
        <span className="font-bold text-sm text-foreground">Eventra</span>
        {isAdmin && (
          <span className="ml-auto px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">
            Admin
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navItems.map((item) => (
          <SidebarLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted transition-colors mb-1">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
            <span className="text-xs text-white font-semibold">
              {(dbUser?.name ?? dbUser?.email ?? 'U')[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              {dbUser?.name ?? dbUser?.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{dbUser?.email}</p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
        >
          <LogOut size={14} />
          Keluar
        </button>
      </div>
    </aside>
  )
}