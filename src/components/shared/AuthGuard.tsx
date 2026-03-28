import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

interface AuthGuardProps {
  children: React.ReactNode
  /** Required roles. If empty/undefined, just requires authentication. */
  roles?: UserRole[]
  /** Required EO status (only applies when role is EO) */
  requireActiveEO?: boolean
}

export function AuthGuard({ children, roles, requireActiveEO }: AuthGuardProps) {
  const { dbUser, isLoading, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isLoading, isAuthenticated, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // Role check
  if (roles && roles.length > 0 && dbUser) {
    const hasRole = roles.includes(dbUser.role as UserRole)
    if (!hasRole) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive font-bold text-lg">!</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Akses Ditolak</h1>
          <p className="text-muted-foreground">
            You don't have permission to view this page.
          </p>
          <button
            onClick={() => navigate({ to: '/' })}
            className="mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go Home
          </button>
        </div>
      )
    }
  }

  return <>{children}</>
}
