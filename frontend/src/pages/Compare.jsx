import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts'
import { API } from '../App.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function StatRow({ label, a, b }) {
  return (
    <tr className="border-t border-gray-800/60">
      <td className="py-2 pr-6 text-xs text-gray-600">{label}</td>
      <td className="py-2 pr-8 text-xs text-gray-200 text-right tabular-nums font-mono">{a}</td>
      <td className="py-2 text-xs text-gray-200 text-right tabular-nums font-mono">{b}</td>
    </tr>
  )
}

const COLORS = { a: '#6366f1', b: '#10b981' }

function SessionHeader({ sess, color, label }) {
  return (
    <div className="flex-1 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono font-medium" style={{ color }}>
          Session {label}
        </span>
        <StatusBadge status={sess.status} />
      </div>
      <div className="font-mono text-xs text-gray-500 mb-1">{sess.id.slice(0, 16)}…</div>
      <div className="text-[11px] text-gray-600 font-mono truncate">{sess.project_path}</div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-2 text-xs">
      <div className="text-gray-500 mb-1">{label}s elapsed</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: ${p.value?.toFixed(5)}
          {p.payload[`${p.name}_tool`] && (
            <span className="text-gray-600"> · {p.payload[`${p.name}_tool`]}</span>
          )}
          {p.payload[`${p.name}_flagged`] && (
            <span className="text-red-400"> ⚑</span>
          )}
        </div>
      ))}
    </div>
  )
}

function mergeTimelines(timelineA, timelineB) {
  const allElapsed = Array.from(
    new Set([...timelineA.map(p => p.elapsed_s), ...timelineB.map(p => p.elapsed_s)])
  ).sort((x, y) => x - y)

  const interpolate = (timeline, elapsed) => {
    const pts = timeline.filter(p => p.elapsed_s <= elapsed)
    return pts.length > 0 ? pts[pts.length - 1].cumulative_cost : 0
  }

  return allElapsed.map(t => ({
    elapsed_s: t,
    a: interpolate(timelineA, t),
    b: interpolate(timelineB, t),
    a_tool:    timelineA.find(p => p.elapsed_s === t)?.tool_name,
    b_tool:    timelineB.find(p => p.elapsed_s === t)?.tool_name,
    a_flagged: timelineA.find(p => p.elapsed_s === t)?.flagged,
    b_flagged: timelineB.find(p => p.elapsed_s === t)?.flagged,
  }))
}

export default function Compare() {
  const [searchParams] = useSearchParams()
  const idA = searchParams.get('a')
  const idB = searchParams.get('b')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!idA || !idB) { setLoading(false); return }
    const q = new URLSearchParams({ a: idA, b: idB })
    fetch(`${API}/sessions/compare?${q}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [idA, idB])

  if (!idA || !idB) return (
    <div className="text-gray-600 text-sm py-12 text-center">
      Select two sessions to compare from the{' '}
      <Link to="/projects" className="text-indigo-400 hover:text-indigo-300">Projects</Link> page.
    </div>
  )
  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>
  if (error || !data) return <div className="text-red-400 text-sm">Failed to load sessions: {error}</div>

  const { a: sideA, b: sideB } = data
  const merged = mergeTimelines(sideA.timeline, sideB.timeline)
  const sessA = sideA.session
  const sessB = sideB.session
  const durA = sessA.ended_at ? Math.round((new Date(sessA.ended_at) - new Date(sessA.started_at)) / 1000) : null
  const durB = sessB.ended_at ? Math.round((new Date(sessB.ended_at) - new Date(sessB.started_at)) / 1000) : null
  const flagsA = sideA.events.filter(e => e.flagged).length
  const flagsB = sideB.events.filter(e => e.flagged).length

  return (
    <div>
      <div className="mb-6">
        <Link to="/projects" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
          ← Projects
        </Link>
      </div>

      <h1 className="text-xl font-semibold mb-6">Session Comparison</h1>

      <div className="flex gap-4 mb-6">
        <SessionHeader sess={sessA} color={COLORS.a} label="A" />
        <SessionHeader sess={sessB} color={COLORS.b} label="B" />
      </div>

      <div className="mb-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="pb-3 text-left text-[11px] text-gray-600 font-medium uppercase tracking-wide" />
              <th className="pb-3 text-right text-[11px] font-medium pr-8" style={{ color: COLORS.a }}>Session A</th>
              <th className="pb-3 text-right text-[11px] font-medium" style={{ color: COLORS.b }}>Session B</th>
            </tr>
          </thead>
          <tbody>
            <StatRow label="Cost"         a={`$${(sessA.total_cost_usd || 0).toFixed(4)}`}     b={`$${(sessB.total_cost_usd || 0).toFixed(4)}`} />
            <StatRow label="Events"       a={sideA.events.length}                               b={sideB.events.length} />
            <StatRow label="Flags"        a={flagsA > 0 ? `⚑ ${flagsA}` : flagsA}              b={flagsB > 0 ? `⚑ ${flagsB}` : flagsB} />
            <StatRow label="Input tokens" a={(sessA.total_input_tokens || 0).toLocaleString()}  b={(sessB.total_input_tokens || 0).toLocaleString()} />
            <StatRow label="Output tokens"a={(sessA.total_output_tokens || 0).toLocaleString()} b={(sessB.total_output_tokens || 0).toLocaleString()} />
            <StatRow label="Duration"     a={durA != null ? `${durA}s` : '—'}                   b={durB != null ? `${durB}s` : '—'} />
            <StatRow label="Trust score"  a={sessA.trust_score?.toFixed(1) ?? '—'}              b={sessB.trust_score?.toFixed(1) ?? '—'} />
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-4">
          Cumulative cost over time
        </h2>
        {merged.length > 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={merged} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis
                dataKey="elapsed_s"
                tick={{ fill: '#4b5563', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                label={{ value: 'seconds', position: 'insideBottomRight', offset: -4, fill: '#4b5563', fontSize: 10 }}
              />
              <YAxis
                tick={{ fill: '#4b5563', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${v.toFixed(3)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => (
                  <span style={{ color: COLORS[value], fontSize: 12 }}>Session {value.toUpperCase()}</span>
                )}
              />
              <Line type="stepAfter" dataKey="a" stroke={COLORS.a} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
              <Line type="stepAfter" dataKey="b" stroke={COLORS.b} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-600 text-sm text-center py-8">
            Not enough data points to plot a timeline.
          </p>
        )}
      </div>
    </div>
  )
}
