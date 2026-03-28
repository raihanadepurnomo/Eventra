import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Mail, ShieldCheck, RotateCw, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

export default function VerifyOtpPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const from = params.get('from') || 'register'
  const { isAuthenticated } = useAuth()

  const [email, setEmail] = useState(params.get('email') || '')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (!email) {
      setError('Email tidak ditemukan. Ulangi proses registrasi/login.')
    }
  }, [email])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!email || otp.length !== 6) {
      setError('Masukkan email dan OTP 6 digit terlebih dahulu')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/verify-otp', {
        email,
        code: otp,
        type: 'verify_email',
      })

      const hasSession = isAuthenticated || Boolean(localStorage.getItem('eventra_token'))
      const shouldReturnToPreviousPage = hasSession && from !== 'login' && from !== 'register'

      if (shouldReturnToPreviousPage) {
        try {
          const ref = document.referrer ? new URL(document.referrer) : null
          const isSafeReferrer =
            ref &&
            ref.origin === window.location.origin &&
            ref.pathname !== '/verify-otp'

          if (isSafeReferrer) {
            window.location.href = `${ref.pathname}${ref.search}${ref.hash}`
            return
          }
        } catch {
          // Ignore invalid referrer and use fallback below.
        }

        if (window.history.length > 1) {
          window.history.back()
          return
        }

        window.location.href = '/dashboard'
        return
      }

      const q = new URLSearchParams({ email, verified: '1' })
      window.location.href = `/login?${q.toString()}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi OTP')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError('')
    setInfo('')

    if (!email) {
      setError('Email wajib diisi')
      return
    }

    setResending(true)
    try {
      await api.post('/auth/resend-otp', { email, type: 'verify_email' })
      setInfo('OTP baru telah dikirim ke email Anda')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim ulang OTP')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-1.5 font-bold text-xl text-foreground">
            <Ticket className="w-6 h-6 text-accent" />
            Eventra<span className="text-accent">.</span>
          </Link>
          <p className="text-sm text-muted-foreground mt-2">Verifikasi Email dengan OTP</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}
          {info && <div className="p-3 rounded-md bg-green-100 text-green-700 text-sm">{info}</div>}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                readOnly
                className="pl-9 bg-muted/40"
                title="Email tidak bisa diubah di halaman verifikasi"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="otp">Kode OTP</Label>
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digit"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="pl-9 tracking-[0.25em]"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">Kode berlaku 10 menit dan hanya bisa dipakai sekali.</p>
          </div>

          <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
            {loading ? 'Memverifikasi...' : 'Verifikasi OTP'}
          </Button>

          <Button type="button" variant="outline" className="w-full" onClick={handleResend} disabled={resending}>
            <RotateCw className="w-4 h-4 mr-2" />
            {resending ? 'Mengirim...' : 'Kirim Ulang OTP'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {from === 'login' ? 'Kembali ke' : 'Sudah verifikasi?'}{' '}
          <Link to="/login" className="text-accent hover:underline font-medium">
            Halaman Login
          </Link>
        </p>
      </div>
    </div>
  )
}
