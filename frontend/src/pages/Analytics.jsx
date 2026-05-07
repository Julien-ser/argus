import { useEffect, useState } from 'react'
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { API } from '../App.jsx'

const BAR_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff']

function Section({ title, data, emptyMsg }) {
  if (!data) return null
  return (
    <div className="mb-10">
      <h2 className="text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-4">{title}</h2>
      {data.length === 0 ? (
        <p className="text-gray-600 text-sm">{emptyMsg || 'No data yet.'}</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 48, top: 0, bottom: 0 }}>
            <XAxis
              type="number"
              tick={{ fill: '#4b5563', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ fill: '#d1d5db', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #1f2937',
                borderRadius: 4,
                fontSize: 12,
              }}
              labelStyle={{ color: '#e5e7eb' }}
              itemStyle={{ color: '#a5b4fc' }}
            />
            <Bar dataKey="count" radius={[0, 2, 2, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/analytics`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>
  if (!data) return <div className="text-red-400 text-sm">Failed to load analytics.</div>

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8">Analytics</h1>
      <Section title="Tools"               data={data.tools}    emptyMsg="No tool events captured yet." />
      <Section title="Hooks fired"         data={data.hooks}    emptyMsg="No hook events captured yet." />
      <Section title="Agent types spawned" data={data.agents}   emptyMsg="No Agent tool calls captured yet." />
      <Section title="Skills invoked"      data={data.skills}   emptyMsg="No Skill tool calls captured yet." />
      <Section title="Top bash commands"   data={data.commands} emptyMsg="No Bash tool calls captured yet." />
    </div>
  )
}
