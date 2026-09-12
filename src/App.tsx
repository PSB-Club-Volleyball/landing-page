import { Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './admin.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Roster from './pages/Roster'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Photos from './pages/Photos'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import CancelRsvp from './pages/CancelRsvp'
import Profile from './pages/Profile'
import Members from './pages/Members'
import MemberProfile from './pages/MemberProfile'
import AdminGate from './pages/admin/AdminGate'

function App() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  return (
    <>
      {!isAdmin && (
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
      )}
      {!isAdmin && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:eventId/cancel/:signupId" element={<CancelRsvp />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/members" element={<Members />} />
        <Route path="/members/:id" element={<MemberProfile />} />
        <Route path="/photos" element={<Photos />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/admin/*" element={<AdminGate />} />
      </Routes>
      {!isAdmin && <Footer />}
    </>
  )
}

export default App
