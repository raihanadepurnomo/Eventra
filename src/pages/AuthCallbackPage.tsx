import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { setToken } from '@/lib/api'
import { useAuthContext } from '@/contexts/AuthContext'

// This page handles the Google OAuth callback
// URL: /auth/callback?token=xxx
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const { refreshUser } = useAuthContext()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const error = params.get('error')

    if (error) {
      navigate({ to: '/login' })
      return
    }

    if (token) {
      setToken(token)
      refreshUser().then((user) => {
        if (user?.role === 'SUPER_ADMIN') {
          navigate({ to: '/admin/dashboard' })
        } else if (user?.role === 'EO') {
          navigate({ to: '/eo/dashboard' })
        } else {
          navigate({ to: '/dashboard' })
        }
      })
    } else {
      navigate({ to: '/login' })
    }
  }, [navigate, refreshUser])

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}
