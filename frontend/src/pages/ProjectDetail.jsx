import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { API } from '../App.jsx'
import TrustBadge from '../components/TrustBadge.jsx'
import CostBadge from '../components/CostBadge.jsx'
import FlagBadge from '../components/FlagBadge.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function SkillPill({ name }) {
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-gray-800 text-gray-400">
      {name}
    </span>
  )
}

const PRIORITY_STYLES = {
  high:   { badge: 'text-red-400',   border: 'border-l-red-500' },
  medium: { badge: 'text-amber-400', border: 'border-l-amber-500' },
  low:    { badge: 'text-blue-400',  border: 'border-l-blue-500' },
  info:   { badge: 'text-gray-500',  border: 'border-l-gray-700' },
}
const TYPE_ICONS = { hook: '⚡', skill: '🎯', agent: '·', config: '⚙' }

const OBS_STYLES = {
  violation: 'border-l-red-500',
  warning:   'border-l-amber-500',
  info:      'border-l-blue-500',
}

// ── Suggestions tab ──────────────────────────────────────────────────────────
function SuggestionCard({ s }) {
  const [open, setOpen] = useState(false)
  const ps = PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.info
  return (
    <div className={`border border-gray-800 border-l-4 ${ps.border} rounded-lg p-4 bg-gray-900/60`}>
      <div className="flex items-start gap-3">
        <span className="text-gray-600 shrink-0">{TYPE_ICONS[s.type] || '·'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[11px] font-medium uppercase tracking-wide ${ps.badge}`}>
              {s.priority}
            </span>
            <span className="text-[11px] text-gray-600">{s.type}</span>
          </div>
          <div className="text-xs text-gray-500 font-mono mb-1">{s.pattern}</div>
          <div className="text-sm text-gray-300">{s.suggestion}</div>
          {s.config_snippet && (
            <button
              onClick={() => setOpen(o => !o)}
              className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 transition-colors"
            >
              {open ? '▾ Hide snippet' : '▸ Show snippet'}
            </button>
          )}
          {open && s.config_snippet && (
            <pre className="mt-2 text-xs text-gray-400 bg-gray-950 rounded p-3 overflow-x-auto whitespace-pre-wrap border border-gray-800">
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
    <div className={`border border-gray-800 border-l-4 ${cls} rounded p-3 mb-2 bg-gray-900/60`}>
      <div className="text-sm font-medium text-gray-200">{obs.title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{obs.detail}</div>
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

  if (loading) return <div className="text-gray-600 text-sm py-4">Loading…</div>
  if (!data) return <div className="text-red-400 text-sm">Failed to load config.</div>

  const { observations, hook_summary, claude_md, project_commands, global_commands, global_settings_summary } = data

  return (
    <div className="space-y-8">
      {observations.length > 0 && (
        <section>
          <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-3">
            Observations
          </h3>
          {observations.map((o, i) => <ObservationRow key={i} obs={o} />)}
        </section>
      )}

      <section>
        <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-3">Hooks</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-gray-600 mb-2">Registered</div>
            {hook_summary.registered.length === 0
              ? <div className="text-xs text-gray-700 italic">None</div>
              : hook_summary.registered.map(h => (
                  <div key={h} className="text-xs font-mono text-green-400">{h}</div>
                ))
            }
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-2">Fired in sessions</div>
            {hook_summary.fired.length === 0
              ? <div className="text-xs text-gray-700 italic">None</div>
              : hook_summary.fired.map(h => (
                  <div key={h} className={`text-xs font-mono ${hook_summary.unregistered_fires.includes(h) ? 'text-amber-400' : 'text-gray-400'}`}>
                    {h}{hook_summary.unregistered_fires.includes(h) ? ' ⚠' : ''}
                  </div>
                ))
            }
          </div>
        </div>
      </section>

      {global_settings_summary && (
        <section>
          <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-3">
            Global settings
          </h3>
          <div className="text-xs font-mono space-y-1 text-gray-400">
            <div><span className="text-gray-600">model: </span>{global_settings_summary.model || '—'}</div>
            <div><span className="text-gray-600">theme: </span>{global_settings_summary.theme || '—'}</div>
            <div><span className="text-gray-600">permissions.allow: </span>{global_settings_summary.permissions_allow_count}</div>
            <div><span className="text-gray-600">hooks: </span>{global_settings_summary.hooks_registered.join(', ') || '—'}</div>
          </div>
        </section>
      )}

      {(project_commands.length > 0 || global_commands.length > 0) && (
        <section>
          <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-3">
            Custom commands
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] text-gray-600 mb-2">Project (.claude/commands/)</div>
              {project_commands.length === 0
                ? <div className="text-xs text-gray-700 italic">None</div>
                : project_commands.map(cmd => (
                    <div key={cmd.name} className="mb-2">
                      <div className="text-xs font-mono text-indigo-400">/{cmd.name}</div>
                      {cmd.preview && <div className="text-[11px] text-gray-600 truncate">{cmd.preview}</div>}
                    </div>
                  ))
              }
            </div>
            <div>
              <div className="text-[11px] text-gray-600 mb-2">Global (~/.claude/commands/)</div>
              {global_commands.length === 0
                ? <div className="text-xs text-gray-700 italic">None</div>
                : global_commands.map(cmd => (
                    <div key={cmd.name} className="mb-2">
                      <div className="text-xs font-mono text-indigo-400">/{cmd.name}</div>
                      {cmd.preview && <div className="text-[11px] text-gray-600 truncate">{cmd.preview}</div>}
                    </div>
                  ))
              }
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-3">CLAUDE.md</h3>
        {claude_md
          ? (
            <pre className="text-xs text-gray-400 bg-gray-900/60 border border-gray-800 rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
              {claude_md}
            </pre>
          )
          : (
            <p className="text-xs text-gray-700 italic">No CLAUDE.md found in {projectPath}</p>
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

  if (loading) return <div className="text-gray-600 text-sm py-4">Analysing patterns…</div>
  if (!suggestions) return <div className="text-red-400 text-sm">Failed to load suggestions.</div>

  if (suggestions.length === 0) {
    return (
      <p className="text-gray-600 text-sm py-12 text-center">
        No optimization patterns detected yet. Suggestions appear after a few sessions.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {suggestions.map((s, i) => <SuggestionCard key={i} s={s} />)}
    </div>
  )
}

// ── Sessions tab ─────────────────────────────────────────────────────────────
const TH = 'pb-3 text-[11px] font-medium text-gray-500 uppercase tracking-wide'

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
      <div className="flex items-center justify-between mb-4 min-h-[28px]">
        {compareUrl ? (
          <Link
            to={compareUrl}
            className="text-sm px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            Compare selected →
          </Link>
        ) : checked.size === 1 ? (
          <span className="text-xs text-gray-600">Select one more session to compare</span>
        ) : <div />}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="pb-3 w-8" />
              <th className={`${TH} text-left`}>Session</th>
              <th className={`${TH} text-left`}>Status</th>
              <th className={`${TH} text-right`}>Trust</th>
              <th className={`${TH} text-right`}>Cost</th>
              <th className={`${TH} text-right`}>Events</th>
              <th className={`${TH} text-right`}>Flags</th>
              <th className={`${TH} text-left pl-4`}>Skills</th>
              <th className={`${TH} text-left`}>Started</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-gray-600 text-sm">
                  No sessions for this project yet.
                </td>
              </tr>
            )}
            {sessions.map(s => (
              <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                <td className="py-3">
                  <input
                    type="checkbox"
                    checked={checked.has(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={checked.size >= 2 && !checked.has(s.id)}
                    className="accent-indigo-500 cursor-pointer"
                  />
                </td>
                <td className="py-3 pr-4">
                  <Link to={`/sessions/${s.id}`} className="text-indigo-400 hover:text-indigo-300 font-mono text-xs">
                    {s.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={s.status} />
                </td>
                <td className="py-3 text-right"><TrustBadge score={s.trust_score} /></td>
                <td className="py-3 text-right"><CostBadge cost={s.total_cost_usd} /></td>
                <td className="py-3 text-right text-gray-400 tabular-nums">{s.event_count}</td>
                <td className="py-3 text-right"><FlagBadge count={s.flag_count} /></td>
                <td className="py-3 pl-4">
                  <div className="flex flex-wrap gap-1">
                    {(s.skill_counts || []).slice(0, 3).map(sk => (
                      <SkillPill key={sk.name} name={sk.name} />
                    ))}
                  </div>
                </td>
                <td className="py-3 text-gray-600 text-[11px] font-mono">
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
  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>

  const totalCost  = sessions.reduce((s, x) => s + (x.total_cost_usd || 0), 0)
  const totalFlags = sessions.reduce((s, x) => s + (x.flag_count || 0), 0)
  const scored     = sessions.filter(s => s.trust_score != null)
  const avgTrust   = scored.length ? scored.reduce((s, x) => s + x.trust_score, 0) / scored.length : null

  return (
    <div>
      <div className="mb-6">
        <Link to="/projects" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
          ← Projects
        </Link>
      </div>

      {/* Project header */}
      <div className="pb-6 mb-6 border-b border-gray-800">
        <h1 className="font-semibold text-lg mb-0.5">{projectName}</h1>
        <div className="text-gray-600 text-[11px] font-mono mb-4">{projectPath}</div>
        <div className="flex flex-wrap gap-8">
          <StatNum n={sessions.length} label="sessions" />
          <StatNum n={`$${totalCost.toFixed(3)}`} label="total cost" mono />
          <StatNum n={totalFlags} label="flags" warn={totalFlags > 0} />
          {avgTrust != null && (
            <StatNum
              n={avgTrust.toFixed(1)}
              label="avg trust"
              mono
              warn={avgTrust < 50}
              ok={avgTrust >= 80}
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

      {tab === 'Sessions'      && <SessionsTab sessions={sessions} projectPath={projectPath} />}
      {tab === 'Suggestions'   && <SuggestionsTab projectPath={projectPath} />}
      {tab === '.claude Config' && <ClaudeConfigTab projectPath={projectPath} />}
    </div>
  )
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
