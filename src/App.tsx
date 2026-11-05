import { Navigate, Route, Routes } from 'react-router'
import AdminAuction from './pages/admin/AdminAuction'
import AdminLayout from './pages/admin/AdminLayout'
import AdminLogin from './pages/admin/AdminLogin'
import AdminPlayers from './pages/admin/AdminPlayers'
import AdminSettings from './pages/admin/AdminSettings'
import AdminTeams from './pages/admin/AdminTeams'
import CaptainBid from './pages/captain/CaptainBid'
import CaptainJoin from './pages/captain/CaptainJoin'
import Home from './pages/Home'
import Live from './pages/Live'
import Results from './pages/Results'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/auction" replace />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="teams" element={<AdminTeams />} />
        <Route path="players" element={<AdminPlayers />} />
        <Route path="auction" element={<AdminAuction />} />
      </Route>

      <Route path="/captain" element={<CaptainJoin />} />
      <Route path="/captain/bid" element={<CaptainBid />} />

      <Route path="/live" element={<Live />} />
      <Route path="/results" element={<Results />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
