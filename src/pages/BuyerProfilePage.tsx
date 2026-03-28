import { useState, useEffect, useRef } from 'react'
import { User, Edit2, Check, X, Ticket, ShoppingBag, DollarSign, TrendingUp, Camera, Lock, Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { api } from '@/lib/api'
import { mapOrder, mapTicket } from '@/lib/mappers'
import { useAuth } from '@/hooks/useAuth'
import { formatIDR, formatDate } from '@/lib/utils'
import type { Order, Ticket as TicketRow } from '@/types'

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-accent" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold font-mono text-foreground">{value}</p>
      </div>
    </div>
  )
}

export default function BuyerProfilePage() {
  const { dbUser } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentName, setCurrentName] = useState('')
  const [currentPhone, setCurrentPhone] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dbUser) return
    setCurrentName(dbUser.name ?? '')
    setNameInput(dbUser.name ?? '')
    setCurrentPhone(dbUser.phone ?? '')
    setPhoneInput(dbUser.phone ?? '')
    loadStats()
  }, [dbUser])

  async function loadStats() {
    if (!dbUser) return
    setLoading(true)
    try {
      const [ords, tix] = await Promise.all([
        api.get<any[]>(`/orders?user_id=${dbUser.id}`),
        api.get<any[]>(`/tickets?user_id=${dbUser.id}`),
      ])
      setOrders(ords.map(mapOrder))
      setTickets(tix.map(mapTicket))
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveProfile() {
    if (!dbUser || !nameInput.trim()) return
    setSavingProfile(true)
    try {
      await api.put(`/users/${dbUser.id}`, { 
        name: nameInput.trim(),
        phone: phoneInput.trim()
      })
      setCurrentName(nameInput.trim())
      setCurrentPhone(phoneInput.trim())
      setEditing(false)
      toast.success('Profil berhasil diperbarui!')
    } catch {
      toast.error('Gagal memperbarui profil.')
    } finally {
      setSavingProfile(false)
    }
  }

  function handleCancelEdit() {
    setNameInput(currentName)
    setPhoneInput(currentPhone)
    setEditing(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !dbUser) return
    setUploadingAvatar(true)
    const formData = new FormData()
    formData.append('avatar', file)
    try {
      await api.upload<{ image: string }>(`/users/${dbUser.id}/avatar`, formData)
      toast.success('Foto profil berhasil diunggah!')
      window.location.reload()
    } catch {
      toast.error('Gagal mengunggah foto profil')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!dbUser || !oldPassword || !newPassword) return
    setChangingPassword(true)
    try {
      await api.put(`/users/${dbUser.id}/password`, { oldPassword, newPassword })
      toast.success('Password berhasil diubah')
      setOldPassword('')
      setNewPassword('')
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah password')
    } finally {
      setChangingPassword(false)
    }
  }

  const paidOrders = orders.filter((o) => o.status === 'PAID')
  const totalSpent = paidOrders.reduce((s, o) => s + Number(o.totalAmount), 0)
  const activeTickets = tickets.filter((t) => t.status === 'ACTIVE' || t.status === 'USED')
  const usedTickets = tickets.filter((t) => Number(t.isUsed) > 0)
  const avatarLetter = (currentName || dbUser?.email || 'U')[0].toUpperCase()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-14">
        <div className="border-b border-border bg-secondary/30">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            <h1 className="text-2xl font-bold text-foreground">Profil Saya</h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola informasi akun Anda</p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Profile Card */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-5">
              <div className="relative shrink-0 group">
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} className="relative block rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent">
                  {dbUser?.image ? (
                    <img src={dbUser.image} alt={currentName} className="w-16 h-16 object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-16 bg-accent/10 border border-accent/20 flex items-center justify-center">
                      <span className="text-xl font-bold text-accent">{avatarLetter}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadingAvatar ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5 text-white" />
                    )}
                  </div>
                </button>
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nama Tampilan</Label>
                  {editing ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="h-9 text-sm max-w-xs" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProfile(); if (e.key === 'Escape') handleCancelEdit() }} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-base font-semibold text-foreground">{currentName || '(belum diatur)'}</p>
                      <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-accent transition-colors"><Edit2 size={14} /></button>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Nomor HP</Label>
                  {editing ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} className="h-9 text-sm max-w-xs" placeholder="Contoh: 08123456789" onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProfile(); if (e.key === 'Escape') handleCancelEdit() }} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-foreground">{currentPhone || <span className="text-destructive italic">Belum diisi</span>}</p>
                    </div>
                  )}
                </div>
                {editing && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="bg-accent text-accent-foreground" onClick={handleSaveProfile} disabled={savingProfile}>
                      {savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>Batal</Button>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="text-sm text-foreground mt-0.5">{dbUser?.email}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Username</Label>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-sm text-foreground">
                      {dbUser?.username ? `@${dbUser.username.replace(/^@+/, '')}` : <span className="text-muted-foreground italic">Belum diatur</span>}
                    </p>
                    <a href="/settings/profile" className="text-xs text-accent hover:underline">
                      {dbUser?.username ? 'Ubah' : 'Atur Username'}
                    </a>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Peran</Label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">
                      <User size={10} />
                      {dbUser?.role === 'EO' ? 'Event Organizer' : dbUser?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Pembeli'}
                    </span>
                    {dbUser?.role === 'BUYER' && (
                      <a href="/eo/setup" className="text-xs text-accent hover:underline">Daftar sebagai EO</a>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Bergabung</Label>
                  <p className="text-sm text-foreground mt-0.5">{dbUser?.createdAt ? formatDate(dbUser.createdAt) : '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Password Card */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Ubah Kata Sandi</h2>
                <p className="text-xs text-muted-foreground">Pastikan akun Anda tetap aman dengan kata sandi yang kuat</p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="oldPassword">Sandi Saat Ini</Label>
                <Input id="oldPassword" type="password" placeholder="Masukkan sandi saat ini" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="newPassword">Sandi Baru</Label>
                <Input id="newPassword" type="password" placeholder="Masukkan sandi baru" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className="h-9 text-sm" />
              </div>
              <Button type="submit" size="sm" className="bg-accent text-accent-foreground" disabled={changingPassword}>
                {changingPassword ? 'Menyimpan...' : 'Perbarui Sandi'}
              </Button>
            </form>
          </div>

          {/* Stats */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Statistik Akun</h2>
              <div className="grid grid-cols-2 gap-4">
                <StatCard icon={ShoppingBag} label="Total Pesanan Lunas" value={String(paidOrders.length)} />
                <StatCard icon={DollarSign} label="Total Pengeluaran" value={formatIDR(totalSpent)} />
                <StatCard icon={Ticket} label="Total Tiket Dimiliki" value={String(activeTickets.length)} />
                <StatCard icon={TrendingUp} label="Event Dihadiri" value={String(usedTickets.length)} />
              </div>
            </div>
          )}

          {/* Recent orders */}
          {!loading && paidOrders.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Pesanan Terbaru</h2>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border"><th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Order ID</th><th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Tanggal</th><th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Total</th></tr></thead>
                  <tbody>
                    {paidOrders.slice(0, 5).map((order) => (
                      <tr key={order.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{order.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{formatDate(order.paidAt ?? order.createdAt)}</td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-foreground text-xs">{formatIDR(Number(order.totalAmount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
