import { useEffect, useState } from 'react'
import { FileText, Download, Calendar, Users, Receipt, Table as TableIcon, File as FileIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { api } from '@/lib/api'
import { mapOrder, mapEvent, mapUser, mapOrderItem, mapTicketType, mapEOProfile } from '@/lib/mappers'
import { formatDate, formatIDR } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { EOProfile, Event, Order, OrderItem, TicketType, Ticket } from '@/types'
import { mapTicket } from '@/lib/mappers'

type ReportType = 'SALES' | 'ATTENDEES' | 'MY_EVENTS'
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
  { label: 'Penjualan Tiket', value: 'SALES', icon: Receipt },
  { label: 'Daftar Peserta', value: 'ATTENDEES', icon: Users },
  { label: 'Event Saya', value: 'MY_EVENTS', icon: Calendar },
]

export default function EOReportsPage() {
  const { dbUser } = useAuth()
  const [profile, setProfile] = useState<EOProfile | null>(null)
  const [type, setType] = useState<ReportType>('SALES')
  const [range, setRange] = useState<RangeKey>('30')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (dbUser) loadProfile()
  }, [dbUser])

  async function loadProfile() {
    try {
      const profiles = await api.get<any[]>(`/eo-profiles?user_id=${dbUser?.id}`)
      if (profiles.length > 0) {
        setProfile(mapEOProfile(profiles[0]))
      }
    } catch (err) {
      console.error('Failed to load EO profile:', err)
    }
  }

  async function fetchData() {
    if (!profile) return []
    setLoading(true)
    try {
      const now = new Date()
      const cutoff = range === 'ALL' ? new Date(0) : new Date(now.getTime() - Number(range) * 24 * 60 * 60 * 1000)

      if (type === 'SALES') {
        const [rawOrders, rawTickets]: [any, any] = await Promise.all([
          api.get(`/orders?eo_profile_id=${profile.id}&status=PAID`),
          api.get('/tickets')
        ])
        
        const tickets = (rawTickets as any[]).map(mapTicket)
        // For Reports, we show all valid sales (Active + Used), but exclude resold (Transferred)
        const invalidOrderItemIds = new Set(tickets.filter(t => t.status === 'TRANSFERRED').map(t => (t as any).orderItemId))
        
        const orders = (rawOrders as any[]).map(mapOrder).filter((o: any) => new Date(o.paidAt || o.createdAt) >= cutoff)
        const filteredOrders: any[] = []
        
        for (const ord of orders) {
          const rawItems: any = await api.get(`/order-items?order_id=${ord.id}`)
          const items = (rawItems as any[]).map(mapOrderItem).filter(i => !invalidOrderItemIds.has(i.id))
          
          if (items.length > 0) {
            const newTotal = items.reduce((s, i) => s + i.subtotal, 0)
            filteredOrders.push({ ...ord, totalAmount: newTotal })
          }
        }
        return filteredOrders

      } else if (type === 'MY_EVENTS') {
        const raw: any = await api.get(`/events?eo_profile_id=${profile.id}`)
        return raw.map(mapEvent).filter((e: any) => new Date(e.createdAt) >= cutoff)

      } else if (type === 'ATTENDEES') {
        const [rawOrders, rawTickets]: [any, any] = await Promise.all([
          api.get(`/orders?eo_profile_id=${profile.id}&status=PAID`),
          api.get('/tickets')
        ])
        const tickets = (rawTickets as any[]).map(mapTicket)
        const invalidOrderItemIds = new Set(tickets.filter(t => t.status === 'TRANSFERRED').map(t => (t as any).orderItemId))

        const orders = (rawOrders as any[]).map(mapOrder).filter((o: any) => new Date(o.paidAt || o.createdAt) >= cutoff)
        
        const allAttendees: any[] = []
        for (const ord of orders) {
          const rawItems: any = await api.get(`/order-items?order_id=${ord.id}`)
          // For attendee list, keep those NOT resold (status != TRANSFERRED)
          const items = (rawItems as any[]).map(mapOrderItem).filter(i => !invalidOrderItemIds.has(i.id))
          
          for (const item of items) {
             if (item.attendeeDetails && Array.isArray(item.attendeeDetails)) {
               item.attendeeDetails.forEach((att: any) => {
                 allAttendees.push({
                   ...att,
                   orderId: ord.id,
                   date: ord.paidAt || ord.createdAt,
                   ticketType: item.ticketTypeId
                 })
               })
             }
          }
        }
        return allAttendees
      }
      return []
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
    doc.text(`Laporan ${type === 'SALES' ? 'Penjualan' : type === 'ATTENDEES' ? 'Peserta' : 'Event'}`, 14, 22)
    doc.setFontSize(10)
    doc.text(`EO: ${profile?.orgName}`, 14, 28)
    doc.text(`Rentang: ${RANGES.find(r => r.value === range)?.label}`, 14, 34)
    doc.text(`Dibuat pada: ${timestamp}`, 14, 40)

    if (type === 'SALES') {
      const body = data.map(o => [
        o.id.toUpperCase(),
        formatDate(o.paidAt || o.createdAt),
        o.paymentMethod || '-',
        formatIDR(o.totalAmount)
      ])
      autoTable(doc, {
        startY: 50,
        head: [['Order ID', 'Tanggal Bayar', 'Metode', 'Total']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [100, 103, 242] }
      })
    } else if (type === 'MY_EVENTS') {
      const body = data.map(e => [
        e.title,
        formatDate(e.createdAt),
        e.status,
        e.location
      ])
      autoTable(doc, {
        startY: 50,
        head: [['Judul Event', 'Dibuat Pada', 'Status', 'Lokasi']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [100, 103, 242] }
      })
    } else if (type === 'ATTENDEES') {
      const body = data.map(a => [
        a.name || '-',
        a.email || '-',
        a.phone || '-',
        formatDate(a.date)
      ])
      autoTable(doc, {
        startY: 50,
        head: [['Nama Peserta', 'Email', 'No. HP', 'Tgl Pembelian']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [100, 103, 242] }
      })
    }

    doc.save(`Eventra_EO_Report_${type}_${range}.pdf`)
  }

  async function exportExcel() {
    const data = await fetchData()
    if (data.length === 0) return alert('Tidak ada data untuk rentang waktu ini.')

    let sheetData: any[] = []
    if (type === 'SALES') {
      sheetData = data.map(o => ({
        'Order ID': o.id.toUpperCase(),
        'Tanggal Bayar': formatDate(o.paidAt || o.createdAt),
        'Metode': o.paymentMethod || '-',
        'Total (IDR)': o.totalAmount
      }))
    } else if (type === 'MY_EVENTS') {
      sheetData = data.map(e => ({
        'Judul Event': e.title,
        'Dibuat Pada': formatDate(e.createdAt),
        'Status': e.status,
        'Lokasi': e.location
      }))
    } else if (type === 'ATTENDEES') {
      sheetData = data.map(a => ({
        'Nama Peserta': a.name || '-',
        'Email': a.email || '-',
        'No. HP': a.phone || '-',
        'Tanggal Pembelian': formatDate(a.date)
      }))
    }

    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `Eventra_EO_Report_${type}_${range}.xlsx`)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText size={16} className="text-accent" /> Ekspor Laporan Penjualan & Dashboard
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
                disabled={loading || !profile}
              >
                <TableIcon size={18} /> Ekspor ke Excel (.xlsx)
              </Button>
              <Button 
                className="w-full sm:w-auto gap-2 h-12 px-8 bg-rose-600 hover:bg-rose-700" 
                onClick={exportPDF}
                disabled={loading || !profile}
              >
                <FileIcon size={18} /> Ekspor ke PDF (.pdf)
              </Button>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl border border-border flex items-start gap-3">
              <div className="mt-0.5 text-accent"><TableIcon size={16} /></div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                <p className="font-bold text-foreground mb-1">Catatan Event Organizer:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Laporan berisi data spesifik untuk organisasi: <strong>{profile?.orgName || '...'}</strong>.</li>
                  <li>Pastikan semua transaksi telah dinyatakan Lunas (PAID) untuk masuk ke laporan penjualan.</li>
                  <li>Laporan peserta menyertakan detail manual yang diisi pembeli saat checkout.</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
