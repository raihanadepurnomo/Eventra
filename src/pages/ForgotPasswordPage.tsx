import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Ticket, Mail, ShieldCheck, Lock, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { api } from '@/lib/api'

type Step = 'request' | 'verify' | 'reset' | 'success'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (step !== 'success') return

    const timer = window.setTimeout(() => {
      const q = new URLSearchParams({ reset: '1', email })
      window.location.href = `/login?${q.toString()}`
    }, 1200)

    return () => window.clearTimeout(timer)
  }, [step, email])

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      await api.post('/auth/forgot-password', { email })
      setInfo('OTP reset password telah dikirim ke email Anda')
      setStep('verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim OTP')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      await api.post('/auth/verify-otp', { email, code: otp, type: 'reset_password' })
      setInfo('OTP valid. Silakan masukkan password baru')
      setStep('reset')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP tidak valid')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (newPassword !== confirmPassword) {
      setError('Password dan konfirmasi password tidak sama')
      return
    }

    if (newPassword.length < 8 || !/(?=.*[A-Za-z])(?=.*[0-9])/.test(newPassword)) {
      setError('Password minimal 8 karakter, mengandung huruf dan angka')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { email, code: otp, newPassword })
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset password')
    } finally {
      setLoading(false)
    }
  }

  async function resendOtp() {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await api.post('/auth/resend-otp', { email, type: 'reset_password' })
      setInfo('OTP baru telah dikirim ke email Anda')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim ulang OTP')
    } finally {
      setLoading(false)
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
          <p className="text-sm text-muted-foreground mt-2">Lupa Password</p>
        </div>

        {error && <div className="p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}
        {info && <div className="p-3 mb-4 rounded-md bg-green-100 text-green-700 text-sm">{info}</div>}

        {step === 'request' && (
          <form onSubmit={requestOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email akun</Label>
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
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {loading ? 'Mengirim OTP...' : 'Kirim OTP Reset'}
            </Button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={verifyOtp} className="space-y-4">
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
            </div>

            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {loading ? 'Memverifikasi...' : 'Verifikasi OTP'}
            </Button>

            <Button type="button" variant="outline" className="w-full" onClick={resendOtp} disabled={loading}>
              <RotateCw className="w-4 h-4 mr-2" />
              Kirim Ulang OTP
            </Button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Password Baru</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Minimal 8 karakter (huruf + angka)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Konfirmasi Password Baru</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Ulangi password baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
            </Button>
          </form>
        )}

        {step === 'success' && (
          <div className="space-y-4">
            <div className="p-4 rounded-md bg-green-100 text-green-700 text-sm">
              Password berhasil diubah. Mengarahkan ke halaman login...
            </div>
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => navigate({ to: '/login' })}>
              Ke Halaman Login
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-6">
          Kembali ke{' '}
          <Link to="/login" className="text-accent hover:underline font-medium">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
