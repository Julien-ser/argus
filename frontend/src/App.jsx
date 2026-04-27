import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Flags from './pages/Flags.jsx'
import SessionDetail from './pages/SessionDetail.jsx'

export const API = 'http://localhost:7777'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-8">
          <span className="font-semibold text-indigo-400 text-lg tracking-tight">Argus</span>
          <NavLink to="/" end className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`
          }>Dashboard</NavLink>
          <NavLink to="/flags" className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`
          }>Flags</NavLink>
        </nav>
        <main className="p-6 max-w-6xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/flags" element={<Flags />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
