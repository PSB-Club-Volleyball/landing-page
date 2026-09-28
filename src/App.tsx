import { lazy, Suspense } from 'react'
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
import People from './pages/People'
import Leaderboard from './pages/Leaderboard'
import MemberProfile from './pages/MemberProfile'

// The admin console is most of the JS and only admins ever load it, so it
// ships as its own chunk. admin.css stays global: public pages reuse some of
// its classes (admin-error, data-table, oauth-*).
const AdminGate = lazy(() => import('./pages/admin/AdminGate'))

const adminLoading = (
  <div className="admin-lock-wrap">
    <p className="admin-loading">Loading&hellip;</p>
  </div>
)

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
        <Route path="/people" element={<People />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/members/:id" element={<MemberProfile />} />
        <Route path="/photos" element={<Photos />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={adminLoading}>
              <AdminGate />
            </Suspense>
          }
        />
      </Routes>
      {!isAdmin && <Footer />}
    </>
  )
}

export default App
