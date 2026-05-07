import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API } from '../App.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'
import TrustBadge from '../components/TrustBadge.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import TraceTree from '../components/TraceTree.jsx'

const PRIORITY_STYLES = {
  high:   { badge: 'text-red-400',    border: 'border-l-red-500' },
  medium: { badge: 'text-amber-400',  border: 'border-l-amber-500' },
  low:    { badge: 'text-blue-400',   border: 'border-l-blue-500' },
  info:   { badge: 'text-gray-500',   border: 'border-l-gray-700' },
}
const TYPE_ICONS = { hook: '⚡', skill: '🎯', agent: '·', config: '⚙' }

function StatItem({ label, value, mono, highlight }) {
  return (
    <div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium mt-0.5 ${highlight ? 'text-indigo-300' : 'text-gray-300'} ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function SuggestionItem({ s }) {
  const [open, setOpen] = useState(false)
  const ps = PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.info
  return (
    <div className={`border border-gray-800 border-l-4 ${ps.border} rounded p-3 bg-gray-900/60`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-gray-600">{TYPE_ICONS[s.type] || '·'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[11px] font-medium uppercase tracking-wide ${ps.badge}`}>
              {s.priority}
            </span>
            <span className="text-[11px] text-gray-600">{s.type}</span>
          </div>
          <div className="text-xs text-gray-500 font-mono mb-1">{s.pattern}</div>
          <div className="text-xs text-gray-300">{s.suggestion}</div>
          {s.config_snippet && (
            <button
              onClick={() => setOpen(o => !o)}
              className="text-xs text-indigo-400 hover:text-indigo-300 mt-1.5 transition-colors"
            >
              {open ? '▾ hide snippet' : '▸ snippet'}
            </button>
          )}
          {open && (
            <pre className="mt-1.5 text-xs text-gray-400 bg-gray-950 rounded p-2 overflow-x-auto whitespace-pre-wrap border border-gray-800">
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

  useEffect(() => {
    fetch(`${API}/sessions/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!data || data.session.status !== 'active') return
    setLiveStatus('connecting')
    const es = new EventSource(`${API}/sessions/stream/${id}`)
    esRef.current = es
    es.onopen = () => setLiveStatus('live')
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'event') {
        setData(prev => ({ ...prev, events: [msg.data, ...prev.events] }))
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

  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>
  if (!data) return <div className="text-red-400 text-sm">Session not found.</div>

  const { session, events: rawEvents } = data
  const events = [...rawEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const flagged = events.filter(e => e.flagged)

  return (
    <div>
      {/* Breadcrumb + live indicator */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
          ← Dashboard
        </Link>
        {liveStatus === 'live' && (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
        {liveStatus === 'connecting' && (
          <span className="text-xs text-gray-600">Connecting…</span>
        )}
        {liveStatus === 'error' && (
          <span className="text-xs text-amber-500">Stream disconnected</span>
        )}
      </div>

      {/* Session header */}
      <div className="mb-6 pb-6 border-b border-gray-800">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="font-semibold text-lg leading-tight">
              {session.project_path || session.id}
            </h1>
            <div className="text-gray-600 text-[11px] font-mono mt-0.5">{session.id}</div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <StatusBadge status={session.status} />
            <TrustBadge score={session.trust_score} />
            <FlagBadge count={flagged.length} />
            <CostBadge cost={session.total_cost_usd} />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <StatItem label="Events"        value={events.length} />
          <StatItem label="Input tokens"  value={session.total_input_tokens.toLocaleString()} mono />
          <StatItem label="Output tokens" value={session.total_output_tokens.toLocaleString()} mono />
          <StatItem label="Total tokens"  value={(session.total_input_tokens + session.total_output_tokens).toLocaleString()} mono highlight />
          <StatItem label="Safety"        value={session.safety_score?.toFixed(1) ?? '—'} mono />
          <StatItem label="Behavior"      value={session.behavior_score?.toFixed(1) ?? '—'} mono />
          <StatItem label="Economy"       value={session.economy_score?.toFixed(1) ?? '—'} mono />
          <StatItem label="Started"       value={new Date(session.started_at).toLocaleString()} />
          {session.ended_at && (
            <StatItem
              label="Duration"
              value={`${Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000)}s`}
              mono
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Trace' && (
        <TraceTree session={session} events={events} />
      )}

      {tab === 'Suggestions' && (
        <div>
          {suggestions === null ? (
            <div className="text-gray-600 text-sm py-8">Analysing patterns…</div>
          ) : suggestions.length === 0 ? (
            <p className="text-gray-600 text-sm py-12 text-center">
              No optimization patterns detected for this project yet.
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s, i) => <SuggestionItem key={i} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
