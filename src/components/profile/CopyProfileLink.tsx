import { useState } from 'react'
import { Check, Link as LinkIcon } from 'lucide-react'
import { toast } from '@/components/ui/toast'

export function CopyProfileLink({ username, className = '' }: { username: string, className?: string }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = () => {
    const url = `${window.location.origin}/${username}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Link profil berhasil disalin!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button 
      onClick={handleCopy}
      className={`inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {copied ? <Check size={16} className="text-green-500" /> : <LinkIcon size={16} />}
      {copied ? 'Tersalin' : 'Salin Link Profil'}
    </button>
  )
}
