import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API } from '../App.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'
import TrustBadge from '../components/TrustBadge.jsx'
import TraceTree from '../components/TraceTree.jsx'

const PRIORITY_STYLES = {
  high:   { badge: 'bg-red-900 text-red-300',      border: 'border-l-red-500' },
  medium: { badge: 'bg-yellow-900 text-yellow-300', border: 'border-l-yellow-500' },
  low:    { badge: 'bg-blue-900 text-blue-300',     border: 'border-l-blue-500' },
  info:   { badge: 'bg-gray-800 text-gray-400',     border: 'border-l-gray-600' },
}
const TYPE_ICONS = { hook: '⚡', skill: '🎯', agent: '🤖', config: '⚙️' }

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-indigo-300' : 'text-gray-300'}`}>{value}</div>
    </div>
  )
}

function SuggestionItem({ s }) {
  const [open, setOpen] = useState(false)
  const ps = PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.info
  return (
    <div className={`border border-gray-800 border-l-4 ${ps.border} rounded p-3 bg-gray-900`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0">{TYPE_ICONS[s.type] || '•'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${ps.badge}`}>{s.priority}</span>
            <span className="text-xs text-gray-500">{s.type}</span>
          </div>
          <div className="text-xs text-gray-400 font-mono mb-1">{s.pattern}</div>
          <div className="text-xs text-gray-200">{s.suggestion}</div>
          {s.config_snippet && (
            <button onClick={() => setOpen(o => !o)} className="text-xs text-indigo-400 hover:text-indigo-300 mt-1">
              {open ? '▾ hide' : '▸ snippet'}
            </button>
          )}
          {open && (
            <pre className="mt-1 text-xs text-gray-300 bg-gray-950 rounded p-2 overflow-x-auto whitespace-pre-wrap border border-gray-800">
              {s.config_snippet}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

const TABS = ['Trace', 'Suggestions']

export default function SessionDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState(null)
  const [tab, setTab] = useState('Trace')
  const [liveStatus, setLiveStatus] = useState(null)
  const esRef = useRef(null)

  // Initial fetch
  useEffect(() => {
    fetch(`${API}/sessions/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  // SSE for active sessions
  useEffect(() => {
    if (!data || data.session.status !== 'active') return

    setLiveStatus('connecting')
    const es = new EventSource(`${API}/sessions/stream/${id}`)
    esRef.current = es

    es.onopen = () => setLiveStatus('live')
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'event') {
        setData(prev => ({
          ...prev,
          events: [msg.data, ...prev.events],
        }))
      } else if (msg.type === 'session_update') {
        setData(prev => ({ ...prev, session: msg.session }))
      } else if (msg.type === 'done') {
        setData(prev => ({ ...prev, session: msg.session }))
        setLiveStatus(null)
        es.close()
      }
    }
    es.onerror = () => { setLiveStatus('error'); es.close() }

    return () => { es.close(); esRef.current = null }
  }, [data?.session?.status, id])

  // Load suggestions when switching to that tab
  useEffect(() => {
    if (tab !== 'Suggestions' || suggestions !== null || !data) return
    const projectPath = data.session.project_path
    if (!projectPath) { setSuggestions([]); return }
    const q = new URLSearchParams({ project_path: projectPath })
    fetch(`${API}/projects/suggestions?${q}`)
      .then(r => r.json())
      .then(d => setSuggestions(d))
      .catch(() => setSuggestions([]))
  }, [tab, suggestions, data])

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>
  if (!data) return <div className="text-red-400 text-sm">Session not found.</div>

  const { session, events: rawEvents } = data
  const events = [...rawEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const flagged = events.filter(e => e.flagged)

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm">← Dashboard</Link>
        {liveStatus === 'live' && (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
        {liveStatus === 'connecting' && (
          <span className="text-xs text-gray-500">Connecting…</span>
        )}
        {liveStatus === 'error' && (
          <span className="text-xs text-yellow-500">Stream disconnected</span>
        )}
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
            <TrustBadge score={session.trust_score} />
            <span className={`text-xs px-2 py-1 rounded-full ${
              session.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'
            }`}>{session.status}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
          <Stat label="Events"         value={events.length} />
          <Stat label="Input tokens"   value={session.total_input_tokens.toLocaleString()} />
          <Stat label="Output tokens"  value={session.total_output_tokens.toLocaleString()} />
          <Stat label="Total tokens"   value={(session.total_input_tokens + session.total_output_tokens).toLocaleString()} highlight />
          <Stat label="Trust Score"    value={session.trust_score?.toFixed(1) ?? '—'} highlight />
          <Stat label="Safety Score"   value={session.safety_score?.toFixed(1) ?? '—'} />
          <Stat label="Behavior Score" value={session.behavior_score?.toFixed(1) ?? '—'} />
          <Stat label="Economy Score"  value={session.economy_score?.toFixed(1) ?? '—'} />
          <Stat label="Started"        value={new Date(session.started_at).toLocaleString()} />
          {session.ended_at && (
            <Stat label="Duration" value={
              `${Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000)}s`
            } />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-4">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Trace' && (
        <>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Trace</h2>
          <TraceTree session={session} events={events} />
        </>
      )}

      {tab === 'Suggestions' && (
        <div>
          {suggestions === null ? (
            <div className="text-gray-500 text-sm py-4">Analysing patterns…</div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12 text-gray-600">
              <div className="text-3xl mb-2">✓</div>
              <div>No optimization patterns detected for this project yet.</div>
              <div className="text-xs mt-1">Suggestions appear after a few sessions of data.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, i) => <SuggestionItem key={i} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
