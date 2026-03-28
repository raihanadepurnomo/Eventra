import { useState } from 'react'
import { FileText, Download, Calendar, Users, Receipt, Table as TableIcon, File as FileIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { mapOrder, mapEvent, mapUser } from '@/lib/mappers'
import { formatDate, formatIDR } from '@/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

type ReportType = 'TRANSACTIONS' | 'EVENTS' | 'USERS'
type RangeKey = '7' | '30' | '90' | '180' | '365' | 'ALL'

const RANGES = [
  { label: '7 Hari Terakhir', value: '7' },
  { label: '30 Hari Terakhir', value: '30' },
  { label: '3 Bulan Terakhir', value: '90' },
  { label: '6 Bulan Terakhir', value: '180' },
  { label: '12 Bulan Terakhir', value: '365' },
  { label: 'Semua Waktu', value: 'ALL' },
]

const TYPES = [
  { label: 'Transaksi & Penjualan', value: 'TRANSACTIONS', icon: Receipt },
  { label: 'Daftar Event', value: 'EVENTS', icon: Calendar },
  { label: 'Database User', value: 'USERS', icon: Users },
]

export default function AdminReportsPage() {
  const [type, setType] = useState<ReportType>('TRANSACTIONS')
  const [range, setRange] = useState<RangeKey>('30')
  const [loading, setLoading] = useState(false)

  async function fetchData() {
    setLoading(true)
    try {
      let data: any[] = []
      const now = new Date()
      const cutoff = range === 'ALL' ? new Date(0) : new Date(now.getTime() - Number(range) * 24 * 60 * 60 * 1000)

      if (type === 'TRANSACTIONS') {
        const raw: any = await api.get('/orders')
        data = raw.map(mapOrder).filter((o: any) => new Date(o.createdAt) >= cutoff)
      } else if (type === 'EVENTS') {
        const raw: any = await api.get('/events')
        data = raw.map(mapEvent).filter((e: any) => new Date(e.createdAt) >= cutoff)
      } else if (type === 'USERS') {
        const raw: any = await api.get('/users')
        data = raw.map(mapUser).filter((u: any) => new Date(u.createdAt) >= cutoff)
      }

      return data
    } finally {
      setLoading(false)
    }
  }

  async function exportPDF() {
    const data = await fetchData()
    if (data.length === 0) return alert('Tidak ada data untuk rentang waktu ini.')

    const doc = new jsPDF()
    const timestamp = new Date().toLocaleString('id-ID')
    
    doc.setFontSize(18)
    doc.text(`Laporan ${type === 'TRANSACTIONS' ? 'Transaksi' : type === 'EVENTS' ? 'Event' : 'User'}`, 14, 22)
    doc.setFontSize(10)
    doc.text(`Rentang: ${RANGES.find(r => r.value === range)?.label}`, 14, 30)
    doc.text(`Dibuat pada: ${timestamp}`, 14, 35)

    if (type === 'TRANSACTIONS') {
      const body = data.map(o => [
        o.id.toUpperCase(),
        formatDate(o.createdAt),
        o.status,
        o.paymentMethod || '-',
        formatIDR(o.totalAmount)
      ])
      autoTable(doc, {
        startY: 45,
        head: [['Order ID', 'Tanggal', 'Status', 'Metode', 'Total']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [100, 103, 242] }
      })
    } else if (type === 'EVENTS') {
      const body = data.map(e => [
        e.title,
        formatDate(e.createdAt),
        e.status,
        e.location
      ])
      autoTable(doc, {
        startY: 45,
        head: [['Judul Event', 'Dibuat Pada', 'Status', 'Lokasi']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [100, 103, 242] }
      })
    } else if (type === 'USERS') {
      const body = data.map(u => [
        u.name || '-',
        u.email,
        u.role,
        formatDate(u.createdAt)
      ])
      autoTable(doc, {
        startY: 45,
        head: [['Nama', 'Email', 'Role', 'Bergabung']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [100, 103, 242] }
      })
    }

    doc.save(`Eventra_Report_${type}_${range}.pdf`)
  }

  async function exportExcel() {
    const data = await fetchData()
    if (data.length === 0) return alert('Tidak ada data untuk rentang waktu ini.')

    let sheetData: any[] = []
    if (type === 'TRANSACTIONS') {
      sheetData = data.map(o => ({
        'Order ID': o.id.toUpperCase(),
        'Tanggal': formatDate(o.createdAt),
        'Status': o.status,
        'Metode': o.paymentMethod || '-',
        'Total (IDR)': o.totalAmount
      }))
    } else if (type === 'EVENTS') {
      sheetData = data.map(e => ({
        'Judul Event': e.title,
        'Dibuat Pada': formatDate(e.createdAt),
        'Status': e.status,
        'Lokasi': e.location
      }))
    } else if (type === 'USERS') {
      sheetData = data.map(u => ({
        'Nama': u.name || '-',
        'Email': u.email,
        'Role': u.role,
        'Tanggal Bergabung': formatDate(u.createdAt)
      }))
    }

    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `Eventra_Report_${type}_${range}.xlsx`)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText size={16} className="text-accent" /> Ekspor Laporan Platform
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">1. Pilih Jenis Laporan</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value as ReportType)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      type === t.value 
                        ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                        : 'border-border bg-card hover:bg-muted/50'
                    }`}
                  >
                    <t.icon className={`w-5 h-5 mb-3 ${type === t.value ? 'text-accent' : 'text-muted-foreground'}`} />
                    <p className={`text-sm font-semibold ${type === t.value ? 'text-accent' : 'text-foreground'}`}>{t.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">2. Pilih Periode Waktu</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRange(r.value as RangeKey)}
                    className={`py-3 px-4 rounded-lg border text-xs font-medium transition-all ${
                      range === r.value 
                        ? 'border-accent bg-accent text-white' 
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center gap-4">
              <Button 
                className="w-full sm:w-auto gap-2 h-12 px-8 bg-emerald-600 hover:bg-emerald-700" 
                onClick={exportExcel}
                disabled={loading}
              >
                <TableIcon size={18} /> Ekspor ke Excel (.xlsx)
              </Button>
              <Button 
                className="w-full sm:w-auto gap-2 h-12 px-8 bg-rose-600 hover:bg-rose-700" 
                onClick={exportPDF}
                disabled={loading}
              >
                <FileIcon size={18} /> Ekspor ke PDF (.pdf)
              </Button>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl border border-border flex items-start gap-3">
              <div className="mt-0.5 text-accent"><TableIcon size={16} /></div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                <p className="font-bold text-foreground mb-1">Catatan Penting:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Laporan PDF cocok untuk pencetakan dan dokumentasi resmi.</li>
                  <li>Laporan Excel lebih baik untuk analisis data lanjut dan pengolahan angka.</li>
                  <li>Waktu yang tercatat dalam laporan menggunakan zona waktu server.</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
