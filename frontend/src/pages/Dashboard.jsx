import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'

function StatCard({ label, value, warn }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${warn ? 'text-red-400' : 'text-white'}`}>{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then(data => { setSessions(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const totalCost = sessions.reduce((s, x) => s + (x.total_cost_usd || 0), 0)
  const totalFlags = sessions.reduce((s, x) => s + (x.flag_count || 0), 0)
  const active = sessions.filter(s => s.status === 'active').length

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Sessions" value={sessions.length} />
        <StatCard label="Active" value={active} />
        <StatCard label="Total Cost" value={`$${totalCost.toFixed(4)}`} />
        <StatCard label="Flagged Events" value={totalFlags} warn={totalFlags > 0} />
      </div>

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Project</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Events</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Flags</th>
              <th className="px-4 py-3 text-left">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">
                  No sessions yet. Start Claude Code with Argus hooks installed.
                </td>
              </tr>
            )}
            {sessions.map(s => {
              const name = s.project_path
                ? (s.project_path.split('/').pop() || s.project_path.split('\\').pop())
                : s.id.slice(0, 8)
              return (
                <tr key={s.id} className="hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/sessions/${s.id}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                      {name}
                    </Link>
                    <div className="text-gray-600 text-xs font-mono truncate max-w-xs">{s.project_path}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === 'active'     ? 'bg-green-900 text-green-300' :
                      s.status === 'completed'  ? 'bg-gray-800 text-gray-400' :
                                                  'bg-yellow-900 text-yellow-300'
                    }`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">{s.event_count}</td>
                  <td className="px-4 py-3 text-right"><CostBadge cost={s.total_cost_usd} /></td>
                  <td className="px-4 py-3 text-right"><FlagBadge count={s.flag_count} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.started_at).toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
