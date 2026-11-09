import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import Home from './pages/Home'

// Each screen loads on demand, so phones and the TV don't download the admin screens.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminSignup = lazy(() => import('./pages/admin/AdminSignup'))
const AdminAuction = lazy(() => import('./pages/admin/AdminAuction'))
const AdminTeams = lazy(() => import('./pages/admin/AdminTeams'))
const AdminPlayers = lazy(() => import('./pages/admin/AdminPlayers'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminAdmins = lazy(() => import('./pages/admin/AdminAdmins'))
const CaptainJoin = lazy(() => import('./pages/captain/CaptainJoin'))
const CaptainBid = lazy(() => import('./pages/captain/CaptainBid'))
const Live = lazy(() => import('./pages/Live'))
const Results = lazy(() => import('./pages/Results'))
const Guide = lazy(() => import('./pages/Guide'))

export default function App() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/signup" element={<AdminSignup />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/auction" replace />} />
          <Route path="auction" element={<AdminAuction />} />
          <Route path="teams" element={<AdminTeams />} />
          <Route path="players" element={<AdminPlayers />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="admins" element={<AdminAdmins />} />
        </Route>

        <Route path="/captain" element={<CaptainJoin />} />
        <Route path="/captain/bid" element={<CaptainBid />} />

        <Route path="/live" element={<Live />} />
        <Route path="/results" element={<Results />} />
        <Route path="/guide" element={<Guide />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
