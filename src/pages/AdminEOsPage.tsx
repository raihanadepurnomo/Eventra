// @ts-nocheck
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import { mapEvent, mapTicketType, mapEOProfile, mapOrder, mapOrderItem, mapTicket, mapResaleListing, mapUser } from '@/lib/mappers'
import { formatDate } from '@/lib/utils'
import { FUNCTIONS } from '@/lib/functions'
import type { EOProfile, User } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'

type TabVal = 'all' | 'PENDING' | 'ACTIVE' | 'SUSPENDED'
interface EnrichedEO { profile: EOProfile; user: User | null }

export default function AdminEOsPage() {
  const [eos, setEOs] = useState<EnrichedEO[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabVal>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const rawProfiles: any = await api.get('/eo-profiles')
      const profiles = rawProfiles.map(mapEOProfile)
      const enriched = await Promise.all(
        profiles.map(async (p) => {
          let user: User | null = null
          try {
            const rawU: any = await api.get(`/users/${p.userId}`)
            user = mapUser(rawU)
          } catch { /* ignore */ }
          return { profile: p, user }
        })
      )
      setEOs(enriched)
    } finally {
      setLoading(false)
    }
  }

  async function notifyEO(profileId: string, approved: boolean) {
    try {
      const authToken = await localStorage.getItem('eventra_token')
      await fetch(FUNCTIONS.notifyEOApproved, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ eoProfileId: profileId, approved }),
      })
    } catch { /* non-blocking */ }
  }

  async function updateStatus(profileId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING') {
    await api.put(`/eo-profiles/${profileId}`, { status })
    setEOs((prev) => prev.map((e) => e.profile.id === profileId ? { ...e, profile: { ...e.profile, status } } : e))
    toast.success(`Status EO diubah ke ${status}`)
    if (status === 'ACTIVE') notifyEO(profileId, true)
    if (status === 'SUSPENDED') notifyEO(profileId, false)
  }

  const filtered = tab === 'all' ? eos : eos.filter((e) => e.profile.status === tab)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
          <h1 className="text-sm font-semibold text-foreground">Kelola Event Organizer</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabVal)}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">Semua ({eos.length})</TabsTrigger>
              <TabsTrigger value="PENDING">Pending ({eos.filter((e) => e.profile.status === 'PENDING').length})</TabsTrigger>
              <TabsTrigger value="ACTIVE">Aktif ({eos.filter((e) => e.profile.status === 'ACTIVE').length})</TabsTrigger>
              <TabsTrigger value="SUSPENDED">Ditangguhkan ({eos.filter((e) => e.profile.status === 'SUSPENDED').length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab}>
              {loading ? (
                <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <p className="text-sm text-muted-foreground">Tidak ada EO di tab ini.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-1/3">Organisasi</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Pendaftar</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Daftar</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(({ profile, user }) => (
                          <tr key={profile.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 max-w-[16rem]">
                              <p className="font-medium text-foreground">{profile.orgName}</p>
                              
                              {profile.phone && <p className="text-xs text-muted-foreground mt-0.5">📞 {profile.phone}</p>}
                              {profile.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2" title={profile.description}>{profile.description}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs hidden sm:table-cell">
                              <p className="font-medium text-foreground">{user?.name ?? '-'}</p>
                              <p className="text-muted-foreground mt-0.5">{user?.email ?? '-'}</p>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell"><StatusBadge status={profile.status} /></td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{formatDate(profile.createdAt)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {profile.status !== 'ACTIVE' && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700" onClick={() => updateStatus(profile.id, 'ACTIVE')}>
                                    <CheckCircle size={12} className="mr-1" /> Setujui
                                  </Button>
                                )}
                                {profile.status !== 'SUSPENDED' && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => updateStatus(profile.id, 'SUSPENDED')}>
                                    <PauseCircle size={12} className="mr-1" /> Tangguhkan
                                  </Button>
                                )}
                                {profile.status !== 'PENDING' && profile.status !== 'ACTIVE' && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => updateStatus(profile.id, 'PENDING')}>
                                    <XCircle size={12} className="mr-1" /> Reset
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  )
}
