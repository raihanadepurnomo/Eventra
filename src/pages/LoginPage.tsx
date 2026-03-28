import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Ticket, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { toast } from '@/components/ui/toast'

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuthContext()
  const navigate = useNavigate()
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const [email, setEmail] = useState(params.get('email') || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info] = useState(() => {
    if (params.get('verified') === '1') {
      return 'Email berhasil diverifikasi. Silakan login dengan email dan password Anda.'
    }
    if (params.get('reset') === '1') {
      return 'Password berhasil diubah. Silakan login dengan password baru Anda.'
    }
    return ''
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password)

      if (result.status === 'otp_required') {
        const q = new URLSearchParams({
          email: result.email,
          type: result.otpType,
          from: 'login',
        })
        window.location.href = `/verify-otp?${q.toString()}`
        return
      }

      const user = result.user
      if (user.role === 'SUPER_ADMIN') {
        navigate({ to: '/admin/dashboard' })
      } else if (user.role === 'EO') {
        if (user.isEmailVerified === false) {
          toast.error('Verifikasikan email anda terlebih dahulu')
          const q = new URLSearchParams({
            email: user.email,
            type: 'verify_email',
            from: 'login',
          })
          window.setTimeout(() => {
            window.location.href = `/verify-otp?${q.toString()}`
          }, 250)
          return
        }
        navigate({ to: '/eo/dashboard' })
      } else {
        navigate({ to: '/dashboard' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-1.5 font-bold text-xl text-foreground">
            <Ticket className="w-6 h-6 text-accent" />
            Eventra<span className="text-accent">.</span>
          </Link>
          <p className="text-sm text-muted-foreground mt-2">Masuk ke akun Anda</p>
        </div>

        {/* Google Login */}
        <Button
          variant="outline"
          className="w-full mb-4 gap-2"
          onClick={loginWithGoogle}
          type="button"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Masuk dengan Google
        </Button>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">atau</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {info && (
            <div className="p-3 rounded-md bg-green-100 text-green-700 text-sm">
              {info}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-9"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={loading}
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </Button>

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-accent hover:underline font-medium">
              Lupa Password?
            </Link>
          </div>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Belum punya akun?{' '}
          <Link to="/register" className="text-accent hover:underline font-medium">
            Daftar di sini
          </Link>
        </p>
      </div>
    </div>
  )
}
