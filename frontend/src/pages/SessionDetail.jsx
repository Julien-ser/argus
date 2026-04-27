import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API } from '../App.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'
import TraceTree from '../components/TraceTree.jsx'

export default function SessionDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/sessions/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>
  if (!data) return <div className="text-red-400 text-sm">Session not found.</div>

  const { session, events } = data
  const flagged = events.filter(e => e.flagged)

  return (
    <div>
      <div className="mb-4">
        <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm">← Dashboard</Link>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-semibold text-lg">{session.project_path || session.id}</h1>
            <div className="text-gray-500 text-xs font-mono mt-0.5">{session.id}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <CostBadge cost={session.total_cost_usd} />
            <FlagBadge count={flagged.length} />
            <span className={`text-xs px-2 py-1 rounded-full ${
              session.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'
            }`}>{session.status}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm text-gray-400">
          <div><span className="text-gray-600">Events </span>{events.length}</div>
          <div><span className="text-gray-600">Input tokens </span>{session.total_input_tokens.toLocaleString()}</div>
          <div><span className="text-gray-600">Output tokens </span>{session.total_output_tokens.toLocaleString()}</div>
          <div><span className="text-gray-600">Started </span>{new Date(session.started_at).toLocaleString()}</div>
        </div>
      </div>

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Trace</h2>
      <TraceTree session={session} events={events} />
    </div>
  )
}
