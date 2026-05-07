import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import ArgusIcon from './components/ArgusIcon.jsx'
import Agents from './pages/Agents.jsx'
import Analytics from './pages/Analytics.jsx'
import Compare from './pages/Compare.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Flags from './pages/Flags.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Projects from './pages/Projects.jsx'
import SessionDetail from './pages/SessionDetail.jsx'
import TrustScoring from './pages/TrustScoring.jsx'

export const API = ''

const NAV_LINKS = [
  { to: '/',          label: 'Dashboard', end: true },
  { to: '/projects',  label: 'Projects' },
  { to: '/flags',     label: 'Flags' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/agents',    label: 'Agents' },
  { to: '/trust',     label: 'Trust' },
]

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 flex items-end h-12">
          <Link to="/" className="flex items-center gap-2 pb-3 mr-5 group">
            <ArgusIcon size={20} />
            <span className="font-mono font-semibold tracking-[0.18em] text-[13px] text-white group-hover:text-gray-200 transition-colors">
              ARGUS
            </span>
          </Link>
          <span className="text-gray-700 pb-3 mr-4 select-none text-xs">|</span>
          {NAV_LINKS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 pb-3 text-[13px] transition-colors border-b-2 ${
                  isActive
                    ? 'text-white border-indigo-500'
                    : 'text-gray-500 hover:text-gray-200 border-transparent'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="px-6 py-8 max-w-6xl mx-auto">
          <Routes>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/sessions/:id"    element={<SessionDetail />} />
            <Route path="/projects"        element={<Projects />} />
            <Route path="/projects/detail" element={<ProjectDetail />} />
            <Route path="/compare"         element={<Compare />} />
            <Route path="/flags"           element={<Flags />} />
            <Route path="/analytics"       element={<Analytics />} />
            <Route path="/agents"          element={<Agents />} />
            <Route path="/trust"           element={<TrustScoring />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
