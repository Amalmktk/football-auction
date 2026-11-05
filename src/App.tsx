import { Navigate, Route, Routes } from 'react-router'
import AdminAuction from './pages/admin/AdminAuction'
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

      <Route path="/admin" element={<Navigate to="/admin/auction" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/settings" element={<AdminSettings />} />
      <Route path="/admin/teams" element={<AdminTeams />} />
      <Route path="/admin/players" element={<AdminPlayers />} />
      <Route path="/admin/auction" element={<AdminAuction />} />

      <Route path="/captain" element={<CaptainJoin />} />
      <Route path="/captain/bid" element={<CaptainBid />} />

      <Route path="/live" element={<Live />} />
      <Route path="/results" element={<Results />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
