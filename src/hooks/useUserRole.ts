import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from './useAuth'
import type { EOProfile, EOStatus, UserRole } from '@/types'

interface UseUserRoleReturn {
  role: UserRole | null
  isAdmin: boolean
  isEO: boolean
  isBuyer: boolean
  eoProfile: EOProfile | null
  eoStatus: EOStatus | null
  isLoading: boolean
}

export function useUserRole(): UseUserRoleReturn {
  const { dbUser, isLoading: authLoading } = useAuth()

  const role = (dbUser?.role as UserRole) ?? null

  const { data: eoProfile, isLoading: eoLoading } = useQuery({
    queryKey: ['eoProfile', dbUser?.id],
    queryFn: async () => {
      if (!dbUser?.id) return null
      const profiles = await api.get<EOProfile[]>(`/eo-profiles?user_id=${dbUser.id}`)
      return profiles[0] ?? null
    },
    enabled: !!dbUser?.id && role === 'EO',
  })

  const isAdmin = role === 'SUPER_ADMIN'
  const isEO = role === 'EO'
  const isBuyer = role === 'BUYER'

  return {
    role,
    isAdmin,
    isEO,
    isBuyer,
    eoProfile: eoProfile ?? null,
    eoStatus: eoProfile?.status ?? null,
    isLoading: authLoading || (isEO && eoLoading),
  }
}
