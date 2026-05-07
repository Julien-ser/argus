import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'

const TYPE_COLORS = {
  'general-purpose': 'text-indigo-400',
  'Explore':         'text-teal-400',
  'Reviewer':        'text-amber-400',
  'Tester':          'text-green-400',
  'Documenter':      'text-blue-400',
  'Plan':            'text-purple-400',
  'Layman':          'text-pink-400',
}

function StatNum({ n, label, mono }) {
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${mono ? 'font-mono text-xl' : ''}`}>{n}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function AgentCard({ agent }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? agent.recent : agent.recent.slice(0, 3)
  const typeColor = TYPE_COLORS[agent.type] || 'text-gray-400'

  return (
    <div className="border-t border-gray-800 pt-5 pb-3">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className={`font-mono text-sm font-medium ${typeColor}`}>{agent.type}</span>
          <div className="flex gap-5 mt-1.5 text-xs text-gray-500">
            <span>
              <span className="text-gray-300 font-medium">{agent.invocations}</span> invocations
            </span>
            <span>
              <span className="text-gray-300 font-medium">{agent.sessions}</span> sessions
            </span>
            <span className="font-mono text-amber-400">${agent.total_cost_usd.toFixed(4)}</span>
          </div>
        </div>
        <span className="text-[11px] text-gray-600 font-mono shrink-0">
          {(agent.invocations / Math.max(agent.sessions, 1)).toFixed(1)}× per session
        </span>
      </div>

      {agent.recent.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-widest font-medium text-gray-600 mb-2">Recent</div>
          <div className="space-y-0">
            {shown.map((r, i) => (
              <div key={i} className="flex items-start gap-3 text-xs py-2 border-t border-gray-800/60">
                <Link
                  to={`/sessions/${r.session_id}`}
                  className="text-indigo-400 hover:text-indigo-300 font-mono shrink-0"
                  title={r.session_id}
                >
                  {r.session_id?.slice(0, 8)}…
                </Link>
                {r.prompt_preview && (
                  <span className="text-gray-500 truncate italic min-w-0" title={r.prompt_preview}>
                    "{r.prompt_preview}"
                  </span>
                )}
                <span className="ml-auto shrink-0 text-gray-700 font-mono">
                  {r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '—'}
                </span>
                {r.flagged && <span className="text-red-400 shrink-0">⚑</span>}
              </div>
            ))}
          </div>
          {agent.recent.length > 3 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="mt-2 text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              {expanded ? 'show less' : `+ ${agent.recent.length - 3} more`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default function Agents() {
  const [agents, setAgents] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/analytics/agents`)
      .then(r => r.json())
      .then(d => { setAgents(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>
  if (!agents) return <div className="text-red-400 text-sm">Failed to load agent data.</div>

  const totalInvocations = agents.reduce((s, a) => s + a.invocations, 0)
  const totalCost        = agents.reduce((s, a) => s + a.total_cost_usd, 0)
  const totalSessions    = agents.reduce((s, a) => s + a.sessions, 0)

  if (agents.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-6">Agents</h1>
        <p className="text-gray-600 text-sm py-12 border-t border-gray-800">
          No agent spawns recorded yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Agents</h1>

      <div className="flex flex-wrap gap-8 pb-6 mb-2 border-b border-gray-800">
        <StatNum n={totalInvocations} label="invocations" />
        <StatNum n={agents.length}    label="agent types" />
        <StatNum n={`$${totalCost.toFixed(4)}`} label="spawn cost" mono />
        <StatNum n={totalSessions}    label="sessions" />
      </div>

      <div>
        {agents.map(a => <AgentCard key={a.type} agent={a} />)}
      </div>
    </div>
  )
}
