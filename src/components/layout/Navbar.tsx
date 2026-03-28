import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Menu, X, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/Avatar'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

function NavLogo() {
  return (
    <Link to="/" className="flex items-center gap-1.5 font-bold text-lg text-foreground tracking-tight">
      <Ticket className="w-5 h-5 text-accent" strokeWidth={2} />
      <span>
        Eventra
        <span className="text-accent">.</span>
      </span>
    </Link>
  )
}

function AuthButtons() {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate({ to: '/login' })}>
        Sign In
      </Button>
      <Button size="sm" onClick={() => navigate({ to: '/register' })} className="bg-accent text-accent-foreground hover:bg-accent/90">
        Get Started
      </Button>
    </div>
  )
}

function UserMenu({ displayName, image, role, logout }: {
  displayName: string
  image?: string
  role: string
  logout: () => void
}) {
  const navigate = useNavigate()
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const profilePath = role === 'BUYER' ? '/dashboard' : role === 'EO' ? '/eo/dashboard' : '/admin/dashboard'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2">
          <Avatar className="w-8 h-8 cursor-pointer">
            {image && <AvatarImage src={image} alt={displayName} />}
            <AvatarFallback className="text-xs font-semibold bg-accent text-accent-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => navigate({ to: '/profile' as '/' })}>
          Profil Saya
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: profilePath as '/' })}>
          Dashboard
        </DropdownMenuItem>
        {role === 'BUYER' && (
          <>
            <DropdownMenuItem onClick={() => navigate({ to: '/dashboard/balance' as '/' })}>
              Saldo Saya
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: '/dashboard/resale' as '/' })}>
              Tiket Jualan
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AuthenticatedNav({ role, displayName, image, logout }: {
  role: string
  displayName: string
  image?: string
  logout: () => void
}) {
  if (role === 'BUYER') {
    return (
      <div className="flex items-center gap-4">
        <Link to="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Tiket Saya
        </Link>
        <UserMenu displayName={displayName} image={image} role={role} logout={logout} />
      </div>
    )
  }
  if (role === 'EO') {
    return (
      <div className="flex items-center gap-3">
        <Link to="/eo/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <UserMenu displayName={displayName} image={image} role={role} logout={logout} />
      </div>
    )
  }
  if (role === 'SUPER_ADMIN') {
    return (
      <div className="flex items-center gap-4">
        <UserMenu displayName={displayName} image={image} role={role} logout={logout} />
      </div>
    )
  }
  return null
}

export function Navbar() {
  const { dbUser, isAuthenticated, login, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const displayName = dbUser?.name ?? 'User'
  const image = dbUser?.image ?? undefined
  const role = dbUser?.role ?? 'BUYER'

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + nav links */}
          <div className="flex items-center gap-6">
            <NavLogo />
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/events"
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
              >
                Events
              </Link>
            </nav>
          </div>

          {/* Right: Auth */}
          <div className="hidden md:flex items-center">
            {isAuthenticated ? (
              <AuthenticatedNav
                role={role}
                displayName={displayName}
                image={image}
                logout={logout}
              />
            ) : (
              <AuthButtons />
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          'md:hidden border-t border-border bg-background overflow-hidden transition-all duration-200',
          mobileOpen ? 'max-h-64' : 'max-h-0'
        )}
      >
        <div className="px-4 py-3 space-y-1">
          <Link
            to="/events"
            onClick={() => setMobileOpen(false)}
            className="flex items-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            Events
          </Link>
          {isAuthenticated ? (
            <>
              {role === 'BUYER' && (
                <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                  Tiket Saya
                </Link>
              )}
              {role === 'EO' && (
                <Link to="/eo/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                  Dashboard
                </Link>
              )}
              {role === 'SUPER_ADMIN' && (
                <Link to="/admin/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                  Admin
                </Link>
              )}
              <button
                onClick={() => { logout(); setMobileOpen(false) }}
                className="flex w-full items-center px-3 py-2 text-sm font-medium text-destructive hover:bg-muted rounded-md transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { navigate({ to: '/login' }); setMobileOpen(false) }} className="w-full">Sign In</Button>
              <Button size="sm" onClick={() => { navigate({ to: '/register' }); setMobileOpen(false) }} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Get Started</Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
