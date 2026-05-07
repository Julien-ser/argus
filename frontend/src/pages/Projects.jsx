import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'
import TrustBadge from '../components/TrustBadge.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function SkillPill({ name }) {
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-gray-800 text-gray-400">
      {name}
    </span>
  )
}

function ProjectCard({ project }) {
  const detailUrl = `/projects/detail?${new URLSearchParams({ path: project.project_path })}`
  const tokens = (project.total_input_tokens || 0) + (project.total_output_tokens || 0)

  return (
    <div className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors bg-gray-900/40">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <Link
            to={detailUrl}
            className="text-indigo-400 hover:text-indigo-300 font-semibold text-sm block truncate"
          >
            {project.project_name}
          </Link>
          <div className="text-gray-700 text-[11px] font-mono truncate mt-0.5">
            {project.project_path}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <TrustBadge score={project.avg_trust_score} />
          <StatusBadge status={project.latest_status} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-3 text-center">
        <div>
          <div className="text-base font-semibold tabular-nums">{project.session_count}</div>
          <div className="text-[11px] text-gray-600 mt-0.5">sessions</div>
        </div>
        <div>
          <div className="text-base font-semibold font-mono tabular-nums">
            ${(project.total_cost_usd || 0).toFixed(3)}
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">cost</div>
        </div>
        <div>
          <div className="text-base font-semibold tabular-nums">
            {tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens}
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">tokens</div>
        </div>
        <div>
          <div className={`text-base font-semibold tabular-nums ${project.flag_count > 0 ? 'text-red-400' : 'text-gray-600'}`}>
            {project.flag_count}
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">flags</div>
        </div>
      </div>

      {project.top_skills.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {project.top_skills.map(sk => (
            <span key={sk.name} className="flex items-center gap-1">
              <SkillPill name={sk.name} />
              <span className="text-gray-700 text-[11px]">×{sk.count}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-gray-700 italic mt-2">No skills recorded</div>
      )}

      <div className="text-[11px] text-gray-700 mt-3">
        Last active {project.last_active ? new Date(project.last_active).toLocaleString() : '—'}
      </div>
    </div>
  )
}

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/projects`)
      .then(r => r.json())
      .then(d => { setProjects(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-xl font-semibold">Projects</h1>
        <span className="text-sm text-gray-500">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {projects.length === 0 ? (
        <p className="text-gray-600 text-sm py-12 border-t border-gray-800 text-center">
          No sessions recorded yet. Start Claude Code with Argus hooks installed.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <ProjectCard key={p.project_path} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
