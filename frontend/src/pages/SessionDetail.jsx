import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API } from '../App.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'
import TraceTree from '../components/TraceTree.jsx'

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-indigo-300' : 'text-gray-300'}`}>{value}</div>
    </div>
  )
}

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

  const { session, events: rawEvents } = data
  const events = [...rawEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
          <Stat label="Events"        value={events.length} />
          <Stat label="Input tokens"  value={session.total_input_tokens.toLocaleString()} />
          <Stat label="Output tokens" value={session.total_output_tokens.toLocaleString()} />
          <Stat label="Total tokens"  value={(session.total_input_tokens + session.total_output_tokens).toLocaleString()} highlight />
          <Stat label="Started"       value={new Date(session.started_at).toLocaleString()} />
          {session.ended_at && (
            <Stat label="Duration" value={
              `${Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000)}s`
            } />
          )}
        </div>
      </div>

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Trace</h2>
      <TraceTree session={session} events={events} />
    </div>
  )
}
