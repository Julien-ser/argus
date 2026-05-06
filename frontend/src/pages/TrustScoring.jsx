import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'
import TrustBadge from '../components/TrustBadge.jsx'

function StatCard({ label, value, warn, color }) {
  const valueClass = warn ? 'text-red-400' : color || 'text-white'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}

function ScorePill({ score }) {
  if (score == null) return <span className="text-gray-600 text-xs font-mono">—</span>
  const cls =
    score >= 80 ? 'text-green-400' :
    score >= 50 ? 'text-yellow-400' :
                  'text-red-400'
  return <span className={`text-xs font-mono ${cls}`}>{score.toFixed(1)}</span>
}

export default function TrustScoring() {
  const [summary, setSummary] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('trust_score')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    Promise.all([
      fetch(`${API}/trust/summary`).then(r => r.json()),
      fetch(`${API}/sessions`).then(r => r.json()),
    ])
      .then(([sum, sess]) => { setSummary(sum); setSessions(sess); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>
  if (!summary) return <div className="text-red-400 text-sm">Failed to load trust data.</div>

  const { tier_distribution: tiers, avg_trust_score, avg_safety_score, avg_behavior_score, avg_economy_score } = summary

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey] ?? -1
    const bv = b[sortKey] ?? -1
    return sortDir === 'asc' ? av - bv : bv - av
  })

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortTh({ col, label, right }) {
    const active = sortKey === col
    return (
      <th
        className={`px-4 py-3 cursor-pointer select-none ${right ? 'text-right' : 'text-left'}`}
        onClick={() => toggleSort(col)}
      >
        <span className={active ? 'text-indigo-400' : 'text-gray-400'}>
          {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </span>
      </th>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Trust Scoring</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Avg Trust Score"
          value={avg_trust_score != null ? avg_trust_score.toFixed(1) : '—'}
          warn={avg_trust_score != null && avg_trust_score < 50}
        />
        <StatCard label="High Trust" value={tiers.high} color="text-green-400" />
        <StatCard label="Medium Trust" value={tiers.medium} color="text-yellow-400" />
        <StatCard label="Low Trust" value={tiers.low} warn={tiers.low > 0} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500 mb-1">Avg Safety</div>
          <div className="text-lg font-mono font-semibold">
            <ScorePill score={avg_safety_score} />
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500 mb-1">Avg Behavior</div>
          <div className="text-lg font-mono font-semibold">
            <ScorePill score={avg_behavior_score} />
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500 mb-1">Avg Economy</div>
          <div className="text-lg font-mono font-semibold">
            <ScorePill score={avg_economy_score} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left text-gray-400">Project</th>
              <th className="px-4 py-3 text-left text-gray-400">Status</th>
              <SortTh col="safety_score"   label="Safety"   right />
              <SortTh col="behavior_score" label="Behavior" right />
              <SortTh col="economy_score"  label="Economy"  right />
              <SortTh col="trust_score"    label="Trust"    right />
              <th className="px-4 py-3 text-right text-gray-400">Cost</th>
              <th className="px-4 py-3 text-right text-gray-400">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm">
                  No sessions yet.
                </td>
              </tr>
            )}
            {sorted.map(s => {
              const name = s.project_path
                ? (s.project_path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || s.id.slice(0, 8))
                : s.id.slice(0, 8)
              return (
                <tr key={s.id} className="hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/sessions/${s.id}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === 'active'    ? 'bg-green-900 text-green-300' :
                      s.status === 'completed' ? 'bg-gray-800 text-gray-400' :
                                                 'bg-yellow-900 text-yellow-300'
                    }`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right"><ScorePill score={s.safety_score} /></td>
                  <td className="px-4 py-3 text-right"><ScorePill score={s.behavior_score} /></td>
                  <td className="px-4 py-3 text-right"><ScorePill score={s.economy_score} /></td>
                  <td className="px-4 py-3 text-right"><TrustBadge score={s.trust_score} /></td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs font-mono">
                    ${(s.total_cost_usd || 0).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.flag_count > 0
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">{s.flag_count}</span>
                      : <span className="text-gray-700 text-xs">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600 mt-4">
        Weights: Safety 50% · Behavior 30% · Economy 20%. Economy score is 100 for active sessions (cost finalized on Stop).
      </p>
    </div>
  )
}
