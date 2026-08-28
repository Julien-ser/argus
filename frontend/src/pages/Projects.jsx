import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'
import { money, tokens as fmtTokens } from '../format.js'
import StatusBadge from '../components/StatusBadge.jsx'

/**
 * One skill and its use count as a single object.
 *
 * These used to be a pill followed by a loose `×1` text node, which read as a
 * broken pill with something spilling out of it rather than as one label.
 */
function SkillPill({ name, count }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded bg-gray-800/80 px-2 py-0.5 font-mono text-[11px] text-gray-400">
      {name}
      {count > 1 && <span className="text-gray-600">×{count}</span>}
    </span>
  )
}

/** A stat. Label above value: the label is the constant, so it anchors the column. */
function Stat({ label, value, mono, alert }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div
        className={[
          'mt-0.5 tabular-nums',
          mono ? 'font-mono' : '',
          alert ? 'font-semibold text-red-400' : 'text-gray-200',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}

function ProjectCard({ project }) {
  const detailUrl = `/projects/detail?${new URLSearchParams({ path: project.project_path })}`
  const tokenTotal = (project.total_input_tokens || 0) + (project.total_output_tokens || 0)
  const trust = project.avg_trust_score
  const trustColor =
    trust == null ? 'text-gray-600' :
    trust >= 80 ? 'text-green-400' :
    trust >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    // flex-col + mt-auto on the footer: grid rows stretch every card to the
    // tallest in the row, and without this the short cards ended with a block
    // of dead space instead of a footer pinned to the bottom edge.
    <div className="flex h-full flex-col rounded-lg border border-gray-800 bg-gray-900/40 p-4 transition-colors hover:border-gray-700">

      {/* Name owns its own line. It previously shared one with the trust score
          and status, which squeezed the path into truncating at ~20 characters
          while there was room to spare. */}
      <div className="flex items-baseline justify-between gap-3">
        <Link
          to={detailUrl}
          className="truncate font-semibold text-gray-100 hover:text-indigo-300"
          title={project.project_name}
        >
          {project.project_name}
        </Link>
        <StatusBadge status={project.latest_status} />
      </div>

      <div className="mt-1 truncate font-mono text-[11px] text-gray-500" title={project.project_path}>
        {project.project_path}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-x-3">
        <Stat label="sessions" value={project.session_count} />
        <Stat label="cost" value={money(project.total_cost_usd)} mono />
        <Stat label="tokens" value={fmtTokens(tokenTotal)} mono />
        <Stat label="flags" value={project.flag_count} alert={project.flag_count > 0} />
      </div>

      {project.top_skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {project.top_skills.map(sk => (
            <SkillPill key={sk.name} name={sk.name} count={sk.count} />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-baseline justify-between gap-3 pt-4 text-[11px] text-gray-600">
        <span className="truncate">
          {project.last_active
            ? `Last active ${new Date(project.last_active).toLocaleDateString()}`
            : 'Never active'}
        </span>
        <span className={`shrink-0 font-mono tabular-nums ${trustColor}`}>
          {trust == null ? '—' : `${trust.toFixed(0)} trust`}
        </span>
      </div>
    </div>
  )
}

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API}/projects`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { setProjects(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  return (
    <div>
      <div className="mb-8 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold">Projects</h1>
        {!loading && !error && (
          <span className="text-sm text-gray-500">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        // Skeletons at the real card size, so the page does not reflow when
        // data lands.
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-44 animate-pulse rounded-lg border border-gray-800 bg-gray-900/40" />
          ))}
        </div>
      ) : error ? (
        <p className="border-t border-gray-800 py-12 text-center text-sm text-red-400">
          Could not load projects ({error}).
        </p>
      ) : projects.length === 0 ? (
        <p className="border-t border-gray-800 py-12 text-center text-sm text-gray-600">
          No sessions recorded yet. Start Claude Code with Argus hooks installed.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => (
            <ProjectCard key={p.project_path} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
