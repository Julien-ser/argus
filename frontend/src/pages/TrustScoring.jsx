import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'
import TrustBadge from '../components/TrustBadge.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function ScorePill({ score }) {
  if (score == null) return <span className="text-gray-600 text-xs font-mono">—</span>
  const cls = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`text-xs font-mono ${cls}`}>{score.toFixed(1)}</span>
}

function StatNum({ n, label, warn, ok }) {
  const cls = warn ? 'text-red-400' : ok ? 'text-green-400' : 'text-white'
  return (
    <div>
      <div className={`text-2xl font-semibold font-mono tabular-nums ${cls}`}>{n}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

const TH = 'pb-3 text-[11px] font-medium text-gray-500 uppercase tracking-wide'

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

  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>
  if (!summary) return <div className="text-red-400 text-sm">Failed to load trust data.</div>

  const {
    tier_distribution: tiers,
    avg_trust_score,
    avg_safety_score,
    avg_behavior_score,
    avg_economy_score,
  } = summary

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
        className={`${TH} pb-3 cursor-pointer select-none ${right ? 'text-right' : 'text-left'}`}
        onClick={() => toggleSort(col)}
      >
        <span className={active ? 'text-indigo-400' : ''}>
          {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
        </span>
      </th>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Trust</h1>

      <div className="flex flex-wrap gap-8 pb-6 mb-8 border-b border-gray-800">
        <StatNum
          n={avg_trust_score != null ? avg_trust_score.toFixed(1) : '—'}
          label="avg trust"
          warn={avg_trust_score != null && avg_trust_score < 50}
          ok={avg_trust_score != null && avg_trust_score >= 80}
        />
        <StatNum n={avg_safety_score?.toFixed(1) ?? '—'}   label="avg safety" />
        <StatNum n={avg_behavior_score?.toFixed(1) ?? '—'} label="avg behavior" />
        <StatNum n={avg_economy_score?.toFixed(1) ?? '—'}  label="avg economy" />
        <StatNum n={tiers.high}   label="high trust" ok />
        <StatNum n={tiers.medium} label="medium" />
        <StatNum n={tiers.low}    label="low trust" warn={tiers.low > 0} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className={`${TH} text-left pb-3`}>Project</th>
              <th className={`${TH} text-left pb-3`}>Status</th>
              <SortTh col="safety_score"   label="Safety"   right />
              <SortTh col="behavior_score" label="Behavior" right />
              <SortTh col="economy_score"  label="Economy"  right />
              <SortTh col="trust_score"    label="Trust"    right />
              <th className={`${TH} text-right pb-3`}>Cost</th>
              <th className={`${TH} text-right pb-3`}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-gray-600 text-sm">
                  No sessions yet.
                </td>
              </tr>
            )}
            {sorted.map(s => {
              const name = s.project_path
                ? (s.project_path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || s.id.slice(0, 8))
                : s.id.slice(0, 8)
              return (
                <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-4">
                    <Link to={`/sessions/${s.id}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                      {name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-3 text-right"><ScorePill score={s.safety_score} /></td>
                  <td className="py-3 text-right"><ScorePill score={s.behavior_score} /></td>
                  <td className="py-3 text-right"><ScorePill score={s.economy_score} /></td>
                  <td className="py-3 text-right"><TrustBadge score={s.trust_score} /></td>
                  <td className="py-3 text-right text-gray-500 text-xs font-mono tabular-nums">
                    ${(s.total_cost_usd || 0).toFixed(4)}
                  </td>
                  <td className="py-3 text-right">
                    {s.flag_count > 0
                      ? <span className="text-xs font-mono text-red-400">⚑ {s.flag_count}</span>
                      : <span className="text-gray-700 text-xs">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-600 mt-4">
        Weights: Safety 50% · Behavior 30% · Economy 20%
      </p>
    </div>
  )
}
