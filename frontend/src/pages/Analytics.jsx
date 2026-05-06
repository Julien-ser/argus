import { useEffect, useState } from 'react'
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { API } from '../App.jsx'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

function Section({ title, data, emptyMsg }) {
  if (!data) return null
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h2>
      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">{emptyMsg || 'No data yet.'}</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fill: '#d1d5db', fontSize: 12, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#a5b4fc' }}
              />
              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
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

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>
  if (!data) return <div className="text-red-400 text-sm">Failed to load analytics.</div>

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Usage Analytics</h1>
      <Section title="Tools" data={data.tools} emptyMsg="No tool events captured yet." />
      <Section title="Hooks Fired" data={data.hooks} emptyMsg="No hook events captured yet." />
      <Section title="Agent Types Spawned" data={data.agents} emptyMsg="No Agent tool calls captured yet." />
      <Section title="Skills Invoked" data={data.skills} emptyMsg="No Skill tool calls captured yet." />
      <Section title="Top Bash Commands" data={data.commands} emptyMsg="No Bash tool calls captured yet." />
    </div>
  )
}
