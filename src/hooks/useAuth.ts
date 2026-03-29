import { useAuthContext } from '@/contexts/AuthContext'
import type { User } from '@/types'

interface UseAuthReturn {
  user: User | null
  dbUser: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: () => void
  logout: () => void
  refreshUser: () => Promise<User | null>
}

export function useAuth(): UseAuthReturn {
  const ctx = useAuthContext()

  return {
    user: ctx.user,
    dbUser: ctx.user,
    isLoading: ctx.isLoading,
    isAuthenticated: ctx.isAuthenticated,
    login: () => {
      // Navigate to login page
      window.location.href = '/login'
    },
    logout: () => {
      ctx.logout()
      window.location.href = '/'
    },
    refreshUser: ctx.refreshUser,
  }
}
