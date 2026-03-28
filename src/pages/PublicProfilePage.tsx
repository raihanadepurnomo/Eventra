import { useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { User, Calendar, MapPin, AtSign, LayoutGrid, XCircle } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { CopyProfileLink } from '@/components/profile/CopyProfileLink'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface PublicProfileData {
  user: {
    username: string
    name: string
    image: string | null
    bio: string | null
    instagramHandle: string | null
    attendedEvents: {
      id: string
      title: string
      bannerImage: string | null
      startDate: string
      city: string
    }[]
  }
}

export default function PublicProfilePage() {
  const { username } = useParams({ strict: false }) as { username: string }
  const [profile, setProfile] = useState<PublicProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProfile() {
      if (!username) return
      setLoading(true)
      try {
        const data = await api.get<PublicProfileData>(`/users/profile/${username}`)
        setProfile(data)
      } catch (err: any) {
        setError(err.message || 'Profil tidak ditemukan')
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [username])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center pt-14">
          <div className="w-8 h-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
        </main>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center pt-14 px-4 text-center">
          <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Profil Tidak Ditemukan</h1>
          <p className="text-muted-foreground max-w-md">
            {error || 'Halaman yang Anda cari tidak tersedia atau sedang disembunyikan oleh pemiliknya.'}
          </p>
        </main>
      </div>
    )
  }

  const { user } = profile

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-accent/20">
      <Navbar />
      <main className="flex-1 pt-14 pb-20">
        
        {/* PROFILE HEADER - Glassmorphic dynamic style */}
        <section className="relative pt-20 pb-16 px-4 overflow-hidden border-b border-border bg-gradient-to-b from-secondary/50 to-background">
          {/* Decorative blur blobs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="relative max-w-3xl mx-auto flex flex-col items-center text-center">
            
            <div className="relative mb-5 group">
              <div className="absolute inset-0 bg-accent/20 rounded-full blur-xl scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              {user.image ? (
                <img 
                  src={user.image} 
                  alt={user.name} 
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-background shadow-xl relative z-10"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-accent text-accent-foreground flex items-center justify-center border-4 border-background shadow-xl relative z-10">
                  <span className="text-4xl font-bold">{(user.name || 'U')[0].toUpperCase()}</span>
                </div>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {user.name}
            </h1>
            <p className="text-sm font-mono text-accent mt-1 bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
              @{user.username.replace(/^@+/, '')}
            </p>

            {user.bio && (
              <p className="mt-5 text-muted-foreground max-w-lg leading-relaxed text-sm sm:text-base">
                {user.bio}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              {user.instagramHandle && (
                <a 
                  href={`https://instagram.com/${user.instagramHandle.replace(/^@+/, '')}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-accent transition-colors bg-secondary/50 px-4 py-2 rounded-full border border-border"
                >
                  <AtSign className="w-4 h-4" />
                  {user.instagramHandle.replace(/^@+/, '')}
                </a>
              )}
              <div className="bg-secondary/50 px-4 py-2 rounded-full border border-border">
                <CopyProfileLink username={user.username} />
              </div>
            </div>

          </div>
        </section>

        {/* ATTENDED EVENTS */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-center gap-2 mb-8">
            <LayoutGrid className="w-5 h-5 text-accent" />
            <h2 className="text-xl font-bold text-foreground">Event yang Dihadiri</h2>
            <span className="ml-2 bg-secondary text-muted-foreground text-xs font-bold px-2 py-0.5 rounded-full">
              {user.attendedEvents.length}
            </span>
          </div>

          {user.attendedEvents.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-2xl border-dashed">
              <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-foreground">Belum ada event</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {user.name} belum menghadiri event apapun atau profil aktivitasnya belum lengkap.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {user.attendedEvents.map(event => (
                <div 
                  key={event.id}
                  className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-accent/50 transition-colors shadow-sm hover:shadow-md"
                >
                  {/* Aspect ratio container for banner */}
                  <div className="w-full h-32 bg-secondary relative overflow-hidden">
                    {event.bannerImage ? (
                      <img 
                        src={event.bannerImage} 
                        alt={event.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-accent/5 text-accent font-bold text-2xl tracking-tighter opacity-50">
                        EVENTRA
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    
                    {/* Event Status Badges inside image */}
                    <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                      <span className="bg-background/90 backdrop-blur text-foreground text-[10px] font-bold px-2 py-1 rounded shadow-sm">
                        COMPLETED
                      </span>
                    </div>
                  </div>

                  {/* Content area */}
                  <div className="p-4">
                    <h3 className="font-semibold text-foreground text-sm sm:text-base mb-2 line-clamp-1 group-hover:text-accent transition-colors">
                      {event.title}
                    </h3>
                    
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5 shrink-0 text-accent/70" />
                        <span>{formatDate(event.startDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-accent/70" />
                        <span className="line-clamp-1">{event.city}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
      <Footer />
    </div>
  )
}
