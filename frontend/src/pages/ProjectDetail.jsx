import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { API } from '../App.jsx'
import TrustBadge from '../components/TrustBadge.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'

const SKILL_COLORS = [
  'bg-indigo-900 text-indigo-300',
  'bg-purple-900 text-purple-300',
  'bg-pink-900 text-pink-300',
  'bg-blue-900 text-blue-300',
  'bg-emerald-900 text-emerald-300',
  'bg-amber-900 text-amber-300',
]

function skillColor(name) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return SKILL_COLORS[Math.abs(h) % SKILL_COLORS.length]
}

const PRIORITY_STYLES = {
  high:   { badge: 'bg-red-900 text-red-300',    border: 'border-l-red-500' },
  medium: { badge: 'bg-yellow-900 text-yellow-300', border: 'border-l-yellow-500' },
  low:    { badge: 'bg-blue-900 text-blue-300',   border: 'border-l-blue-500' },
  info:   { badge: 'bg-gray-800 text-gray-400',   border: 'border-l-gray-600' },
}

const TYPE_ICONS = { hook: '⚡', skill: '🎯', agent: '🤖', config: '⚙️' }

const OBS_STYLES = {
  violation: 'border-l-red-500 bg-red-950',
  warning:   'border-l-yellow-500 bg-yellow-950',
  info:      'border-l-blue-500 bg-blue-950',
}

// ── Suggestions tab ──────────────────────────────────────────────────────────
function SuggestionCard({ s }) {
  const [open, setOpen] = useState(false)
  const ps = PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.info
  return (
    <div className={`border border-gray-800 border-l-4 ${ps.border} rounded-lg p-4 bg-gray-900`}>
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0">{TYPE_ICONS[s.type] || '•'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono uppercase ${ps.badge}`}>
              {s.priority}
            </span>
            <span className="text-xs text-gray-500 uppercase tracking-wide">{s.type}</span>
          </div>
          <div className="text-sm text-gray-400 mb-1 font-mono">{s.pattern}</div>
          <div className="text-sm text-gray-200">{s.suggestion}</div>
          {s.config_snippet && (
            <button
              onClick={() => setOpen(o => !o)}
              className="text-xs text-indigo-400 hover:text-indigo-300 mt-2"
            >
              {open ? '▾ Hide snippet' : '▸ Show snippet'}
            </button>
          )}
          {open && s.config_snippet && (
            <pre className="mt-2 text-xs text-gray-300 bg-gray-950 rounded p-3 overflow-x-auto whitespace-pre-wrap border border-gray-800">
              {s.config_snippet}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

// ── .claude Config tab ───────────────────────────────────────────────────────
function ObservationRow({ obs }) {
  const cls = OBS_STYLES[obs.level] || OBS_STYLES.info
  return (
    <div className={`border border-gray-800 border-l-4 ${cls} rounded p-3 mb-2`}>
      <div className="text-sm font-medium text-gray-200">{obs.title}</div>
      <div className="text-xs text-gray-400 mt-0.5">{obs.detail}</div>
    </div>
  )
}

function ClaudeConfigTab({ projectPath }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = new URLSearchParams({ project_path: projectPath })
    fetch(`${API}/projects/claude-config?${q}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectPath])

  if (loading) return <div className="text-gray-500 text-sm py-4">Loading…</div>
  if (!data) return <div className="text-red-400 text-sm">Failed to load config.</div>

  const { observations, hook_summary, claude_md, project_commands, global_commands, global_settings_summary } = data

  return (
    <div className="space-y-6">
      {/* Observations */}
      {observations.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Observations
          </h3>
          {observations.map((o, i) => <ObservationRow key={i} obs={o} />)}
        </section>
      )}

      {/* Hook summary */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Hooks
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded p-3">
            <div className="text-xs text-gray-500 mb-2">Registered</div>
            {hook_summary.registered.length === 0
              ? <div className="text-xs text-gray-600 italic">None</div>
              : hook_summary.registered.map(h => (
                  <div key={h} className="text-xs font-mono text-green-400">{h}</div>
                ))
            }
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded p-3">
            <div className="text-xs text-gray-500 mb-2">Fired in sessions</div>
            {hook_summary.fired.length === 0
              ? <div className="text-xs text-gray-600 italic">None</div>
              : hook_summary.fired.map(h => (
                  <div key={h} className={`text-xs font-mono ${hook_summary.unregistered_fires.includes(h) ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {h}{hook_summary.unregistered_fires.includes(h) ? ' ⚠' : ''}
                  </div>
                ))
            }
          </div>
        </div>
      </section>

      {/* Global settings summary */}
      {global_settings_summary && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Global Settings (~/.claude/settings.json)
          </h3>
          <div className="bg-gray-900 border border-gray-800 rounded p-3 text-xs font-mono space-y-1">
            <div><span className="text-gray-500">model: </span><span className="text-gray-200">{global_settings_summary.model || '—'}</span></div>
            <div><span className="text-gray-500">theme: </span><span className="text-gray-200">{global_settings_summary.theme || '—'}</span></div>
            <div><span className="text-gray-500">permissions.allow count: </span><span className="text-gray-200">{global_settings_summary.permissions_allow_count}</span></div>
            <div><span className="text-gray-500">hooks registered: </span><span className="text-gray-200">{global_settings_summary.hooks_registered.join(', ') || '—'}</span></div>
          </div>
        </section>
      )}

      {/* Custom commands */}
      {(project_commands.length > 0 || global_commands.length > 0) && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Custom Commands
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-600 mb-2">Project (.claude/commands/)</div>
              {project_commands.length === 0
                ? <div className="text-xs text-gray-700 italic">None</div>
                : project_commands.map(cmd => (
                    <div key={cmd.name} className="mb-2">
                      <div className="text-xs font-mono text-indigo-300">/{cmd.name}</div>
                      {cmd.preview && (
                        <div className="text-xs text-gray-600 truncate">{cmd.preview}</div>
                      )}
                    </div>
                  ))
              }
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-2">Global (~/.claude/commands/)</div>
              {global_commands.length === 0
                ? <div className="text-xs text-gray-700 italic">None</div>
                : global_commands.map(cmd => (
                    <div key={cmd.name} className="mb-2">
                      <div className="text-xs font-mono text-purple-300">/{cmd.name}</div>
                      {cmd.preview && (
                        <div className="text-xs text-gray-600 truncate">{cmd.preview}</div>
                      )}
                    </div>
                  ))
              }
            </div>
          </div>
        </section>
      )}

      {/* CLAUDE.md viewer */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          CLAUDE.md
        </h3>
        {claude_md
          ? (
            <pre className="text-xs text-gray-300 bg-gray-900 border border-gray-800 rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
              {claude_md}
            </pre>
          )
          : (
            <div className="text-xs text-gray-600 italic bg-gray-900 border border-gray-800 rounded p-4">
              No CLAUDE.md found in {projectPath}
            </div>
          )
        }
      </section>
    </div>
  )
}

// ── Suggestions tab ──────────────────────────────────────────────────────────
function SuggestionsTab({ projectPath }) {
  const [suggestions, setSuggestions] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = new URLSearchParams({ project_path: projectPath })
    fetch(`${API}/projects/suggestions?${q}`)
      .then(r => r.json())
      .then(d => { setSuggestions(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectPath])

  if (loading) return <div className="text-gray-500 text-sm py-4">Analysing patterns…</div>
  if (!suggestions) return <div className="text-red-400 text-sm">Failed to load suggestions.</div>

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-3xl mb-2">✓</div>
        <div>No optimization patterns detected yet.</div>
        <div className="text-xs mt-1">Suggestions appear after a few sessions of data.</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s, i) => <SuggestionCard key={i} s={s} />)}
    </div>
  )
}

// ── Sessions tab ─────────────────────────────────────────────────────────────
function SessionsTab({ sessions, projectPath }) {
  const [checked, setChecked] = useState(new Set())

  function toggle(id) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 2) next.add(id)
      return next
    })
  }

  const [idA, idB] = [...checked]
  const compareUrl = idA && idB ? `/compare?${new URLSearchParams({ a: idA, b: idB })}` : null

  return (
    <div>
      {compareUrl && (
        <div className="flex justify-end mb-3">
          <Link
            to={compareUrl}
            className="text-sm px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded transition-colors"
          >
            Compare 2 selected →
          </Link>
        </div>
      )}
      {checked.size === 1 && (
        <div className="text-xs text-gray-500 text-right mb-3">Select one more session to compare</div>
      )}

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-3 py-3 w-8"></th>
              <th className="px-4 py-3 text-left">Session</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Trust</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Events</th>
              <th className="px-4 py-3 text-right">Flags</th>
              <th className="px-4 py-3 text-left">Skills</th>
              <th className="px-4 py-3 text-left">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sessions.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-600 text-sm">
                  No sessions for this project yet.
                </td>
              </tr>
            )}
            {sessions.map(s => (
              <tr key={s.id} className="hover:bg-gray-900 transition-colors">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={checked.has(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={checked.size >= 2 && !checked.has(s.id)}
                    className="accent-indigo-500 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link to={`/sessions/${s.id}`} className="text-indigo-400 hover:text-indigo-300 font-mono text-xs">
                    {s.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.status === 'active' ? 'bg-green-900 text-green-300' :
                    s.status === 'completed' ? 'bg-gray-800 text-gray-400' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 text-right"><TrustBadge score={s.trust_score} /></td>
                <td className="px-4 py-3 text-right"><CostBadge cost={s.total_cost_usd} /></td>
                <td className="px-4 py-3 text-right text-gray-400">{s.event_count}</td>
                <td className="px-4 py-3 text-right"><FlagBadge count={s.flag_count} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(s.skill_counts || []).slice(0, 3).map(sk => (
                      <span key={sk.name} className={`text-xs px-1 py-0.5 rounded font-mono ${skillColor(sk.name)}`}>
                        {sk.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(s.started_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
const TABS = ['Sessions', 'Suggestions', '.claude Config']

export default function ProjectDetail() {
  const [searchParams] = useSearchParams()
  const projectPath = searchParams.get('path') || ''
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Sessions')

  const projectName = projectPath.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop() || projectPath

  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then(all => {
        setSessions(all.filter(s => s.project_path === projectPath))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectPath])

  if (!projectPath) return <div className="text-red-400 text-sm">No project path specified.</div>
  if (loading) return <div className="text-gray-500 text-sm">Loading…</div>

  const totalCost = sessions.reduce((s, x) => s + (x.total_cost_usd || 0), 0)
  const totalFlags = sessions.reduce((s, x) => s + (x.flag_count || 0), 0)
  const scored = sessions.filter(s => s.trust_score != null)
  const avgTrust = scored.length ? scored.reduce((s, x) => s + x.trust_score, 0) / scored.length : null

  return (
    <div>
      <div className="mb-4">
        <Link to="/projects" className="text-gray-500 hover:text-gray-300 text-sm">← Projects</Link>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h1 className="font-semibold text-lg">{projectName}</h1>
        <div className="text-gray-500 text-xs font-mono mt-0.5 mb-4">{projectPath}</div>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-semibold">{sessions.length}</div>
            <div className="text-xs text-gray-500">sessions</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">${totalCost.toFixed(3)}</div>
            <div className="text-xs text-gray-500">total cost</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${totalFlags > 0 ? 'text-red-400' : ''}`}>{totalFlags}</div>
            <div className="text-xs text-gray-500">flags</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">
              {avgTrust != null ? avgTrust.toFixed(1) : '—'}
            </div>
            <div className="text-xs text-gray-500">avg trust</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-6">
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

      {tab === 'Sessions' && (
        <SessionsTab sessions={sessions} projectPath={projectPath} />
      )}
      {tab === 'Suggestions' && (
        <SuggestionsTab projectPath={projectPath} />
      )}
      {tab === '.claude Config' && (
        <ClaudeConfigTab projectPath={projectPath} />
      )}
    </div>
  )
}
