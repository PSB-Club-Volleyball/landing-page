import { Route, Routes } from 'react-router-dom'
import './App.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Roster from './pages/Roster'
import Events from './pages/Events'
import Photos from './pages/Photos'

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/events" element={<Events />} />
        <Route path="/photos" element={<Photos />} />
      </Routes>
      <Footer />
    </>
  )
}

export default App
