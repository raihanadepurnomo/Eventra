import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { X, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

export function UsernameSetupBanner() {
  const { dbUser } = useAuth()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!dbUser) return
    if (dbUser.username) return // Already setup

    const isDismissed = localStorage.getItem('hideUsernameBanner') === 'true'
    if (!isDismissed) {
      setIsVisible(true)
    }
  }, [dbUser])

  if (!isVisible) return null

  const dismiss = () => {
    localStorage.setItem('hideUsernameBanner', 'true')
    setIsVisible(false)
  }

  return (
    <div className="bg-gradient-to-r from-accent/20 to-accent/5 border border-accent/20 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6 relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
      
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            ✨ Klaim username-mu!
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dapatkan halaman profil personalmu di <span className="font-mono text-xs font-semibold">eventra.raihanadepurnomo.dev/[username]</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 z-10">
        <Button asChild size="sm" className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to="/settings/profile">Klaim Sekarang</Link>
        </Button>
        <button 
          onClick={dismiss}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
