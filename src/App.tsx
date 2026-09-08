import { Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './admin.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Roster from './pages/Roster'
import Events from './pages/Events'
import Photos from './pages/Photos'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import CancelRsvp from './pages/CancelRsvp'
import AdminGate from './pages/admin/AdminGate'

function App() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  return (
    <>
      {!isAdmin && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:eventId/cancel/:signupId" element={<CancelRsvp />} />
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
