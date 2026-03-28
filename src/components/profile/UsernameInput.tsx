import { useState, useEffect } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

interface UsernameInputProps {
  value: string
  onChange: (val: string) => void
  onValidityChange?: (isValid: boolean) => void
  label?: string
  className?: string
  id?: string
}

export function UsernameInput({ 
  value, 
  onChange, 
  onValidityChange, 
  label = "Username", 
  className = "", 
  id = "username" 
}: UsernameInputProps) {
  const { dbUser } = useAuth()
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ available: boolean; reason: string | null } | null>(null)

  useEffect(() => {
    // If empty, no need to validate
    if (!value.trim()) {
      setValidationResult(null)
      onValidityChange?.(false)
      return
    }

    // Local basic validations before API
    const regex = /^[a-z0-9_]{3,20}$/
    if (!regex.test(value)) {
      setValidationResult({ available: false, reason: 'Hanya a-z, 0-9, _, 3-20 karakter' })
      onValidityChange?.(false)
      return
    }
    if (/^[0-9_]/.test(value)) {
      setValidationResult({ available: false, reason: 'Tidak boleh diawali angka atau _' })
      onValidityChange?.(false)
      return
    }

    // If it's already the user's current username, it's valid immediately
    if (dbUser?.username === value) {
      setValidationResult({ available: true, reason: null })
      onValidityChange?.(true)
      return
    }

    // Debounce API check
    setIsValidating(true)
    const timeoutId = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean; reason: string | null }>(
          `/users/username/check?username=${encodeURIComponent(value)}&current_user_id=${dbUser?.id || ''}`
        )
        setValidationResult(res)
        onValidityChange?.(res.available)
      } catch (err) {
        setValidationResult({ available: false, reason: 'Gagal mengecek username' })
        onValidityChange?.(false)
      } finally {
        setIsValidating(false)
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [value, dbUser?.id, dbUser?.username, onValidityChange])

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder="contoh: john_doe123"
          className="pr-10"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="absolute inset-y-0 right-3 flex items-center">
          {isValidating && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
          {!isValidating && validationResult && (
            validationResult.available 
              ? <Check className="w-4 h-4 text-green-500" />
              : <X className="w-4 h-4 text-destructive" />
          )}
        </div>
      </div>
      
      <div className="min-h-[20px] text-xs">
        {value.length > 0 && validationResult && !validationResult.available && !isValidating && (
          <p className="text-destructive font-medium">{validationResult.reason}</p>
        )}
        {value.length > 0 && validationResult?.available && !isValidating && (
          <p className="text-muted-foreground">
            eventra.com/<span className="font-semibold text-foreground">{value}</span>
          </p>
        )}
        {isValidating && (
          <p className="text-muted-foreground">Mengecek ketersediaan...</p>
        )}
      </div>
    </div>
  )
}
