import { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, User, AtSign, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/toast'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { UsernameInput } from '@/components/profile/UsernameInput'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

export default function ProfileSettingsPage() {
  const { dbUser, refreshUser } = useAuth()
  const navigate = useNavigate()
  
  const [username, setUsername] = useState('')
  const [isUsernameValid, setIsUsernameValid] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)
  
  const [bio, setBio] = useState('')
  const [instagram, setInstagram] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    if (dbUser) {
      setUsername(dbUser.username || '')
      setBio(dbUser.bio || '')
      setInstagram(dbUser.instagramHandle || '')
      setIsPublic(dbUser.isProfilePublic ?? true)
    }
  }, [dbUser])

  const handleSaveUsername = async () => {
    if (!dbUser?.isEmailVerified) {
      toast.error('Verifikasikan email anda terlebih dahulu')
      return
    }
    if (!isUsernameValid || username === dbUser?.username) return
    setSavingUsername(true)
    try {
      await api.put('/users/username', { username })
      toast.success('Username berhasil diperbarui')
      await refreshUser()
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah username')
    } finally {
      setSavingUsername(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!dbUser) return
    setSavingProfile(true)
    try {
      await api.put(`/users/${dbUser.id}`, { 
        bio,
        instagram_handle: instagram,
        is_profile_public: isPublic
      })
      toast.success('Pengaturan profil publik berhasil disimpan')
      await refreshUser()
    } catch {
      toast.error('Gagal menyimpan profil')
    } finally {
      setSavingProfile(false)
    }
  }

  const isUsernameUnchanged = username === (dbUser?.username || '')
  const hasCooldown = dbUser?.usernameChangedAt ? true : false

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-14">
        <div className="border-b border-border bg-secondary/30">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => navigate({ to: '/profile' })}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Kembali ke Profil Utama
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Pengaturan Profil</h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola username dan tampilan profil publik Anda</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            
            {/* USERNAME SECTION */}
            <div className="p-5 sm:p-6 space-y-5 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Username</h2>
                <p className="text-sm text-muted-foreground">Pilih username unik untuk URL profil Anda.</p>
              </div>
              
              <UsernameInput 
                value={username} 
                onChange={setUsername}
                onValidityChange={setIsUsernameValid}
              />

              {hasCooldown && dbUser?.username && (
                <div className="flex items-start gap-3 text-sm bg-accent/10 text-accent p-3 rounded-lg border border-accent/20">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-0.5">Aturan Ganti Username</p>
                    <p>Username hanya bisa diganti 1x per 30 hari.</p>
                  </div>
                </div>
              )}

              {dbUser?.isEmailVerified === false && (
                <div className="flex items-start gap-3 text-sm bg-amber-50 text-amber-700 p-3 rounded-lg border border-amber-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-0.5">Email Belum Terverifikasi</p>
                    <p>Klaim username hanya bisa dilakukan setelah email terverifikasi.</p>
                  </div>
                </div>
              )}

              <Button 
                onClick={handleSaveUsername} 
                className="bg-accent text-accent-foreground w-full sm:w-auto"
                disabled={savingUsername || !isUsernameValid || isUsernameUnchanged}
              >
                {savingUsername ? 'Menyimpan...' : 'Simpan Username'}
              </Button>
            </div>

            {/* PUBLIC PROFILE SECTION */}
            <div className="p-5 sm:p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Profil Publik</h2>
                <p className="text-sm text-muted-foreground">Sesuaikan informasi yang terlihat oleh orang lain.</p>
              </div>
              
              <div className="space-y-1.5">
                <Label>Foto & Nama Tampil</Label>
                <div className="flex items-center gap-3 p-3 bg-secondary/20 rounded-lg border border-border/50">
                  {dbUser?.image ? (
                    <img src={dbUser.image} alt={dbUser.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                      <User className="w-5 h-5 text-accent" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{dbUser?.name || 'Belum diatur'}</p>
                    <p className="text-xs text-muted-foreground">Ubah foto & nama di <Link to="/profile" className="text-accent hover:underline">Profil Utama</Link></p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                  <div className="flex justify-between items-end">
                    <Label htmlFor="bio">Bio</Label>
                    <span className={`text-[10px] sm:text-xs ${bio.length > 160 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {bio.length}/160
                    </span>
                  </div>
                <Input 
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ceritakan sedikit tentang dirimu..."
                  maxLength={160}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="instagram">Instagram Handle (Opsional)</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                    <AtSign className="w-4 h-4" />
                  </div>
                  <Input 
                    id="instagram"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value.replace('@',''))}
                    placeholder="username_ig"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-border mt-6">
                <div className="flex items-start sm:items-center justify-between gap-4 py-4">
                   <div>
                     <Label className="text-base text-foreground font-semibold flex items-center gap-2">
                       {isPublic ? <Eye className="w-4 h-4 text-accent" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                       Tampilkan profil saya ke publik
                     </Label>
                     <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
                       Jika dimatikan, halaman <span className="font-mono">eventra.com/{dbUser?.username || '[username]'}</span> akan disembunyikan.
                     </p>
                   </div>
                   <Switch 
                     checked={isPublic} 
                     onCheckedChange={setIsPublic} 
                   />
                </div>
              </div>

              <div className="pt-2">
                <Button 
                    onClick={handleSaveProfile} 
                    className="bg-accent text-accent-foreground w-full sm:w-auto"
                    disabled={savingProfile || bio.length > 160}
                >
                    {savingProfile ? ' Menyimpan...' : 'Simpan Perubahan Profil'}
                </Button>
              </div>

            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
