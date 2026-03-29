import { lazy, Suspense } from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router'
import { AuthGuard } from '@/components/shared/AuthGuard'

// ─── Lazy page imports ────────────────────────────────────────────────────────
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const BrowseEventsPage = lazy(() => import('@/pages/BrowseEventsPage'))
const EventDetailPage = lazy(() => import('@/pages/EventDetailPage'))
const BuyerDashboardPage = lazy(() => import('@/pages/BuyerDashboardPage'))
const BuyerOrdersPage = lazy(() => import('@/pages/BuyerOrdersPage'))
const EOSetupPage = lazy(() => import('@/pages/EOSetupPage'))
const EODashboardPage = lazy(() => import('@/pages/EODashboardPage'))
const EOEventsPage = lazy(() => import('@/pages/EOEventsPage'))
const EOCreateEventPage = lazy(() => import('@/pages/EOCreateEventPage'))
const EOEventDetailPage = lazy(() => import('@/pages/EOEventDetailPage'))
const EOPromoEventsPage = lazy(() => import('./pages/EOPromoEventsPage'))
const EOPromosPage = lazy(() => import('@/pages/EOPromosPage'))
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage'))
const AdminEOsPage = lazy(() => import('@/pages/AdminEOsPage'))
const AdminEventsPage = lazy(() => import('@/pages/AdminEventsPage'))
const AdminTransactionsPage = lazy(() => import('@/pages/AdminTransactionsPage'))
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage'))
const EOQRScannerPage = lazy(() => import('@/pages/EOQRScannerPage'))
const EOAttendeesPage = lazy(() => import('@/pages/EOAttendeesPage'))
const EOReportsPage = lazy(() => import('./pages/EOReportsPage'))
const BuyerProfilePage = lazy(() => import('@/pages/BuyerProfilePage'))
const ProfileSettingsPage = lazy(() => import('@/pages/ProfileSettingsPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const VerifyOtpPage = lazy(() => import('@/pages/VerifyOtpPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'))
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'))
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'))
const SeatSocialPage = lazy(() => import('@/pages/SeatSocialPage'))
const BuyerResaleDashboard = lazy(() => import('@/pages/BuyerResaleDashboard'))
const BalanceDashboardPage = lazy(() => import('@/pages/BalanceDashboardPage'))
const ResaleSellTicketPage = lazy(() => import('@/pages/ResaleSellTicketPage'))
const AdminWithdrawalsPage = lazy(() => import('@/pages/AdminWithdrawalsPage'))
const AdminResalePage = lazy(() => import('@/pages/AdminResalePage'))
const EOFinancePage = lazy(() => import('@/pages/EOFinancePage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const TermsPage = lazy(() => import('@/pages/TermsPage'))

// ─── Page loader spinner ──────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}

// ─── Root route ───────────────────────────────────────────────────────────────
const rootRoute = createRootRoute({
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  ),
})

// ─── Auth routes ──────────────────────────────────────────────────────────────
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <LoginPage />,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: () => <RegisterPage />,
})

const verifyOtpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-otp',
  component: () => <VerifyOtpPage />,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: () => <ForgotPasswordPage />,
})

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: () => <AuthCallbackPage />,
})

// ─── Public routes ────────────────────────────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <LandingPage />,
})

const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/events',
  component: () => <BrowseEventsPage />,
})

const eventDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/events/$id',
  component: () => <EventDetailPage />,
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: () => <AboutPage />,
})

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: () => <PrivacyPage />,
})

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: () => <TermsPage />,
})

// ─── Buyer / protected routes ─────────────────────────────────────────────────
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <BuyerDashboardPage />
    </AuthGuard>
  ),
})

const dashboardOrdersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/orders',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <BuyerOrdersPage />
    </AuthGuard>
  ),
})

// ─── EO routes ────────────────────────────────────────────────────────────────
const eoSetupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/setup',
  component: () => (
    <AuthGuard roles={['EO', 'BUYER', 'SUPER_ADMIN']}>
      <EOSetupPage />
    </AuthGuard>
  ),
})

const eoDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/dashboard',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EODashboardPage />
    </AuthGuard>
  ),
})

const eoEventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/events',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOEventsPage />
    </AuthGuard>
  ),
})

const eoCreateEventRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/events/create',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOCreateEventPage />
    </AuthGuard>
  ),
})

const eoEventDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/events/$id',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOEventDetailPage />
    </AuthGuard>
  ),
})

const eoPromoEventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/promos',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOPromoEventsPage />
    </AuthGuard>
  ),
})

const eoPromosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/events/$id/promos',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOPromosPage />
    </AuthGuard>
  ),
})

const eoQRScannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/scanner',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOQRScannerPage />
    </AuthGuard>
  ),
})

const eoAttendeesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/attendees',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOAttendeesPage />
    </AuthGuard>
  ),
})

const eoReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/reports',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOReportsPage />
    </AuthGuard>
  ),
})

const eoFinanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/eo/finance',
  component: () => (
    <AuthGuard roles={['EO']} requireVerifiedEmailForEO>
      <EOFinancePage />
    </AuthGuard>
  ),
})

const buyerProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <BuyerProfilePage />
    </AuthGuard>
  ),
})

const profileSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/profile',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <ProfileSettingsPage />
    </AuthGuard>
  ),
})

const seatSocialRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/tickets/$ticketId/social',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <SeatSocialPage />
    </AuthGuard>
  ),
})

const dashboardResaleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/resale',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <BuyerResaleDashboard />
    </AuthGuard>
  ),
})

const dashboardBalanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/balance',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <BalanceDashboardPage />
    </AuthGuard>
  ),
})

const resaleSellRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/tickets/$ticketId/sell',
  component: () => (
    <AuthGuard roles={['BUYER', 'EO', 'SUPER_ADMIN']}>
      <ResaleSellTicketPage />
    </AuthGuard>
  ),
})

// ─── Admin routes ─────────────────────────────────────────────────────────────
const adminDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/dashboard',
  component: () => (
    <AuthGuard roles={['SUPER_ADMIN']}>
      <AdminDashboardPage />
    </AuthGuard>
  ),
})

const adminEOsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/eos',
  component: () => (
    <AuthGuard roles={['SUPER_ADMIN']}>
      <AdminEOsPage />
    </AuthGuard>
  ),
})

const adminEventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/events',
  component: () => (
    <AuthGuard roles={['SUPER_ADMIN']}>
      <AdminEventsPage />
    </AuthGuard>
  ),
})

const adminTransactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/transactions',
  component: () => (
    <AuthGuard roles={['SUPER_ADMIN']}>
      <AdminTransactionsPage />
    </AuthGuard>
  ),
})

const adminReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/reports',
  component: () => (
    <AuthGuard roles={['SUPER_ADMIN']}>
      <AdminReportsPage />
    </AuthGuard>
  ),
})

const adminWithdrawalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/withdrawals',
  component: () => (
    <AuthGuard roles={['SUPER_ADMIN']}>
      <AdminWithdrawalsPage />
    </AuthGuard>
  ),
})

const adminResaleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/resale',
  component: () => (
    <AuthGuard roles={['SUPER_ADMIN']}>
      <AdminResalePage />
    </AuthGuard>
  ),
})

const publicProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$username',
  component: () => <PublicProfilePage />,
})

// ─── Route tree ───────────────────────────────────────────────────────────────
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  verifyOtpRoute,
  forgotPasswordRoute,
  authCallbackRoute,
  eventsRoute,
  eventDetailRoute,
  dashboardRoute,
  dashboardOrdersRoute,
  eoSetupRoute,
  eoDashboardRoute,
  eoEventsRoute,
  eoCreateEventRoute,
  eoEventDetailRoute,
  eoPromoEventsRoute,
  eoPromosRoute,
  eoQRScannerRoute,
  eoAttendeesRoute,
  eoReportsRoute,
  eoFinanceRoute,
  buyerProfileRoute,
  profileSettingsRoute,
  seatSocialRoute,
  adminDashboardRoute,
  adminEOsRoute,
  adminEventsRoute,
  adminTransactionsRoute,
  adminReportsRoute,
  adminWithdrawalsRoute,
  adminResaleRoute,
  dashboardResaleRoute,
  dashboardBalanceRoute,
  resaleSellRoute,
  aboutRoute,
  privacyRoute,
  termsRoute,
  publicProfileRoute,
])

// ─── Router ───────────────────────────────────────────────────────────────────
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return <RouterProvider router={router} />
}
