import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'
import TrustBadge from '../components/TrustBadge.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

function StatNum({ n, label, mono, warn, ok }) {
  const cls = warn ? 'text-red-400' : ok ? 'text-green-400' : 'text-white'
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${mono ? 'font-mono text-xl' : ''} ${cls}`}>{n}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function SkillPill({ name }) {
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-gray-800 text-gray-400">
      {name}
    </span>
  )
}

const TH = 'pb-3 text-[11px] font-medium text-gray-500 uppercase tracking-wide'

export default function Dashboard() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then(data => { setSessions(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const totalCost   = sessions.reduce((s, x) => s + (x.total_cost_usd || 0), 0)
  const totalFlags  = sessions.reduce((s, x) => s + (x.flag_count || 0), 0)
  const totalTokens = sessions.reduce((s, x) => s + (x.total_input_tokens || 0) + (x.total_output_tokens || 0), 0)
  const active      = sessions.filter(s => s.status === 'active').length
  const scored      = sessions.filter(s => s.trust_score != null)
  const avgTrust    = scored.length ? scored.reduce((s, x) => s + x.trust_score, 0) / scored.length : null

  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>

  return (
    <div>
      <div className="flex flex-wrap gap-8 pb-6 mb-8 border-b border-gray-800">
        <StatNum n={sessions.length} label="sessions" />
        <StatNum n={active} label="active" />
        <StatNum n={fmtTokens(totalTokens)} label="tokens" mono />
        <StatNum n={`$${totalCost.toFixed(3)}`} label="total cost" mono />
        <StatNum n={totalFlags} label="flags" warn={totalFlags > 0} />
        {avgTrust != null && (
          <StatNum n={avgTrust.toFixed(1)} label="avg trust" mono warn={avgTrust < 50} ok={avgTrust >= 80} />
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="text-gray-600 text-sm py-12 text-center">
          No sessions yet. Start Claude Code with Argus hooks installed.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className={`${TH} text-left`}>Project</th>
                <th className={`${TH} text-left`}>Status</th>
                <th className={`${TH} text-right`}>Trust</th>
                <th className={`${TH} text-right`}>Events</th>
                <th className={`${TH} text-right`}>Tokens</th>
                <th className={`${TH} text-right`}>Cost</th>
                <th className={`${TH} text-right`}>Flags</th>
                <th className={`${TH} text-left pl-4`}>Started</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const name = s.project_path
                  ? (s.project_path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || s.id.slice(0, 8))
                  : s.id.slice(0, 8)
                return (
                  <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                    <td className="py-3 pr-6">
                      <Link to={`/sessions/${s.id}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                        {name}
                      </Link>
                      <div className="text-gray-600 text-[11px] font-mono truncate max-w-xs mt-0.5">
                        {s.project_path}
                      </div>
                      {s.skill_counts?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {s.skill_counts.slice(0, 3).map(sk => <SkillPill key={sk.name} name={sk.name} />)}
                          {s.skill_counts.length > 3 && (
                            <span className="text-[11px] text-gray-600">+{s.skill_counts.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-3 text-right"><TrustBadge score={s.trust_score} /></td>
                    <td className="py-3 text-right text-gray-400 tabular-nums">{s.event_count}</td>
                    <td className="py-3 text-right text-gray-500 text-xs font-mono tabular-nums">
                      {fmtTokens((s.total_input_tokens || 0) + (s.total_output_tokens || 0))}
                    </td>
                    <td className="py-3 text-right"><CostBadge cost={s.total_cost_usd} /></td>
                    <td className="py-3 text-right"><FlagBadge count={s.flag_count} /></td>
                    <td className="py-3 pl-4 text-gray-600 text-[11px] font-mono tabular-nums">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
