import { useEffect, useState, useMemo } from 'react'
import { Users, Calendar, Ticket, DollarSign, CheckCircle, XCircle, Building2, Clock, BarChart3, PieChart as PieChartIcon, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapEOProfile, mapOrder, mapUser } from '@/lib/mappers'
import { formatDate, formatDateRange, formatIDR } from '@/lib/utils'
import { FUNCTIONS } from '@/lib/functions'
import type { EOProfile, Event, Order, User } from '@/types'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts'

interface EnrichedEO { profile: EOProfile; user: User | null }

const COLORS = ['#6467F2', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-accent/10' : 'bg-muted'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [pendingEOs, setPendingEOs] = useState<EnrichedEO[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [resaleOrders, setResaleOrders] = useState<any[]>([])
  const [allProfiles, setAllProfiles] = useState<EOProfile[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [profiles, rawEvs, ords, users, rOrds] = await Promise.all([
        api.get('/eo-profiles'),
        api.get('/events'),
        api.get('/orders'),
        api.get('/users'),
        api.get('/resale/orders')
      ])

      const mappedProfiles = (profiles as any[]).map(mapEOProfile)
      setAllProfiles(mappedProfiles)
      setEvents((rawEvs as any[]).map(mapEvent))
      setOrders((ords as any[]).map(mapOrder))
      setResaleOrders(rOrds as any[])
      setAllUsers((users as any[]).map(mapUser))
      
      const pending = mappedProfiles.filter((p) => p.status === 'PENDING')
      const enriched = await Promise.all(
        pending.map(async (p) => {
          let user: User | null = null
          try { 
            const rawU: any = await api.get(`/users/${p.userId}`)
            user = mapUser(rawU)
          } catch { /* ignore */ }
          return { profile: p, user }
        })
      )
      setPendingEOs(enriched)
    } finally {
      setLoading(false)
    }
  }

  // ─── Data Processing ───────────────────────────────────────────────────────

  const revenueData = useMemo(() => {
    const map: Record<string, number> = {}
    orders.filter(o => o.status === 'PAID').forEach(o => {
      const month = String(o.paidAt || o.createdAt).slice(0, 7)
      map[month] = (map[month] || 0) + Number(o.totalAmount)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name))
  }, [orders])

  const userRoleData = useMemo(() => {
    const roles: Record<string, number> = {}
    allUsers.forEach(u => { roles[u.role] = (roles[u.role] || 0) + 1 })
    return Object.entries(roles).map(([name, value]) => ({ name, value }))
  }, [allUsers])

  const eventStatusData = useMemo(() => {
    const status: Record<string, number> = {}
    events.forEach(e => { status[e.status] = (status[e.status] || 0) + 1 })
    return Object.entries(status).map(([name, value]) => ({ name, value }))
  }, [events])

  const growthData = useMemo(() => {
    const months: Record<string, { users: number; eos: number }> = {}
    allUsers.forEach(u => {
      const m = u.createdAt.slice(0, 7)
      if (!months[m]) months[m] = { users: 0, eos: 0 }
      months[m].users++
    })
    allProfiles.forEach(p => {
      const m = p.createdAt.slice(0, 7)
      if (!months[m]) months[m] = { users: 0, eos: 0 }
      months[m].eos++
    })
    return Object.entries(months).map(([name, val]) => ({ name, ...val })).sort((a,b) => a.name.localeCompare(b.name))
  }, [allUsers, allProfiles])

  const totalRevenue = orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + Number(o.totalAmount), 0)
  const totalResaleFee = resaleOrders.filter((o) => o.status === 'PAID').reduce((s, o) => s + Number(o.platform_fee), 0)

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleApprove(profileId: string) {
    await api.put(`/eo-profiles/${profileId}`, { status: 'ACTIVE' })
    toast.success('EO berhasil disetujui!')
    setPendingEOs((prev) => prev.filter((e) => e.profile.id !== profileId))
    setAllProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, status: 'ACTIVE' } : p))
  }

  async function handleReject(profileId: string) {
    await api.put(`/eo-profiles/${profileId}`, { status: 'SUSPENDED' })
    toast.success('EO ditolak.')
    setPendingEOs((prev) => prev.filter((e) => e.profile.id !== profileId))
  }

  async function handleExpireOrders() {
    try {
      const res = await fetch(FUNCTIONS.expireOrders, { method: 'POST' })
      const data = await res.json()
      toast.success(`${data.expired ?? 0} pesanan kadaluarsa diproses.`)
      load()
    } catch {
      toast.error('Gagal menjalankan expire orders.')
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Admin Dashboard</h1>
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleExpireOrders}>
            <Clock size={12} /> Proses Order Kedaluarsa
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={Users} label="Total Users" value={String(allUsers.length)} />
                <StatCard icon={Calendar} label="Total Event" value={String(events.length)} accent />
                <StatCard icon={Building2} label="Total EO" value={String(allProfiles.length)} />
                <StatCard icon={DollarSign} label="Revenue Event" value={formatIDR(totalRevenue)} accent />
                <StatCard icon={TrendingUp} label="Fee Resale" value={formatIDR(totalResaleFee)} accent />
              </div>

              {/* Charts Row 1 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold text-foreground">Pertumbuhan Revenue (Bulanan)</h2>
                  </div>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueData}>
                        <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6467F2" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6467F2" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                        <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} />
                        <Tooltip 
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                          formatter={(v) => formatIDR(Number(v))}
                        />
                        <Area type="monotone" dataKey="value" stroke="#6467F2" fillOpacity={1} fill="url(#colorRev)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2 mb-6">
                    <PieChartIcon className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold text-foreground">Distribusi Role User</h2>
                  </div>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={userRoleData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {userRoleData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Charts Row 2 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <h2 className="text-sm font-semibold text-foreground">Pertumbuhan Platform</h2>
                  </div>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={growthData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                        <Bar dataKey="users" name="User Baru" fill="#10B981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="eos" name="EO Baru" fill="#6467F2" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2 mb-6">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-semibold text-foreground">Status Event</h2>
                  </div>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={eventStatusData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {eventStatusData.map((_, index) => <Cell key={index} fill={COLORS[(index + 2) % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Pending EOs */}
              {pendingEOs.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
                  <div className="flex items-center gap-2 p-4 border-b border-amber-200">
                    <Building2 className="w-4 h-4 text-amber-600" />
                    <h2 className="text-sm font-semibold text-amber-800">Permohonan EO Menunggu ({pendingEOs.length})</h2>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {pendingEOs.map(({ profile, user }) => (
                      <div key={profile.id} className="flex items-center justify-between p-4 gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{profile.orgName}</p>
                          <p className="text-xs text-muted-foreground">{user?.email ?? profile.userId}</p>
                          {profile.phone && <p className="text-xs text-muted-foreground">{profile.phone}</p>}
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(profile.createdAt)}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(profile.id)}>
                            <CheckCircle size={12} className="mr-1" /> Setujui
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleReject(profile.id)}>
                            <XCircle size={12} className="mr-1" /> Tolak
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Events & Transactions Table split if needed, but charts are primary now */}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
