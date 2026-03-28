import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { CameraOff } from 'lucide-react'

export function QRScannerPlugin({ onScan }: { onScan: (code: string) => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScanRef = useRef('')
  const [errorMsg, setErrorMsg] = useState('')
  
  // Unique ID per instance to avoid StrictMode DOM reference clashes
  const containerId = useMemo(() => `qr-camera-${Math.random().toString(36).substring(2, 9)}`, [])

  const stableOnScan = useCallback((code: string) => {
    if (code === lastScanRef.current) return
    lastScanRef.current = code
    onScan(code)
    // Reset after 3s so same code can be scanned again
    setTimeout(() => { lastScanRef.current = '' }, 3000)
  }, [onScan])

  useEffect(() => {
    let mounted = true
    setErrorMsg('')

    async function startScanner() {
      // Delay to handle double mount gracefully
      await new Promise(res => setTimeout(res, 250))
      if (!mounted) return

      try {
        const domNode = document.getElementById(containerId)
        if (!domNode) {
          setErrorMsg('Kontainer kamera tidak ditemukan.')
          return
        }

        const html5Qrcode = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          },
          verbose: false
        })
        scannerRef.current = html5Qrcode

        if (!mounted) {
           try { html5Qrcode.clear() } catch {}
           return
        }

        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 30,
            // Membuang batasan qrbox agar bisa scan dari sudut mana saja (lebih sensitif)
          },
          (decodedText) => {
            stableOnScan(decodedText)
          },
          () => {} // ignore frame errors
        )
      } catch (err: any) {
        console.warn('QR Scanner start error:', err)
        if (typeof navigator !== 'undefined' && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
          setErrorMsg('Browser Anda tidak mendukung akses kamera di halaman ini. Gunakan localhost atau HTTPS.')
        } else {
          setErrorMsg('Gagal mengakses kamera. Pastikan izin kamera telah diberikan dan tidak sedang digunakan oleh aplikasi lain.')
        }
      }
    }

    startScanner()

    return () => {
      mounted = false
      if (scannerRef.current) {
        try {
          const stopPromise = scannerRef.current.stop()
          if (stopPromise && typeof stopPromise.catch === 'function') {
             stopPromise.catch(() => {})
          }
        } catch {}
        try {
           scannerRef.current.clear()
        } catch {}
        scannerRef.current = null
      }
    }
  }, [containerId, stableOnScan])

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black flex flex-col items-center justify-center" style={{ minHeight: '300px', maxHeight: '400px' }}>
      {errorMsg ? (
        <div className="text-center p-6 text-white/80">
          <CameraOff className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      ) : (
        <>
          <div id={containerId} className="w-full" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[60vw] max-w-[250px] aspect-square border-2 border-accent rounded-2xl opacity-60" />
          </div>
          <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/70 bg-black/50 py-1.5 px-3 mx-auto max-w-fit rounded-full backdrop-blur-sm">
            Arahkan kamera ke QR Code tiket
          </p>
        </>
      )}
    </div>
  )
}
