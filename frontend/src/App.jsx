import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Analytics from './pages/Analytics.jsx'
import Compare from './pages/Compare.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Flags from './pages/Flags.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Projects from './pages/Projects.jsx'
import SessionDetail from './pages/SessionDetail.jsx'
import TrustScoring from './pages/TrustScoring.jsx'

export const API = ''

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-8">
          <span className="font-semibold text-indigo-400 text-lg tracking-tight">Argus</span>
          <NavLink to="/" end className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`
          }>Dashboard</NavLink>
          <NavLink to="/projects" className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`
          }>Projects</NavLink>
          <NavLink to="/flags" className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`
          }>Flags</NavLink>
          <NavLink to="/analytics" className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`
          }>Analytics</NavLink>
          <NavLink to="/trust" className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`
          }>Trust</NavLink>
        </nav>
        <main className="p-6 max-w-6xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/detail" element={<ProjectDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/flags" element={<Flags />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/trust" element={<TrustScoring />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
