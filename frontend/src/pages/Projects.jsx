import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'
import TrustBadge from '../components/TrustBadge.jsx'

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

function SkillPill({ name }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${skillColor(name)}`}>
      {name}
    </span>
  )
}

function ProjectCard({ project }) {
  const detailUrl = `/projects/detail?${new URLSearchParams({ path: project.project_path })}`
  const tokens = (project.total_input_tokens || 0) + (project.total_output_tokens || 0)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <Link
            to={detailUrl}
            className="text-indigo-400 hover:text-indigo-300 font-semibold text-base block truncate"
          >
            {project.project_name}
          </Link>
          <div className="text-gray-600 text-xs font-mono truncate mt-0.5">
            {project.project_path}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <TrustBadge score={project.avg_trust_score} />
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            project.latest_status === 'active'
              ? 'bg-green-900 text-green-300'
              : 'bg-gray-800 text-gray-400'
          }`}>
            {project.latest_status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-3 text-center">
        <div>
          <div className="text-lg font-semibold text-white">{project.session_count}</div>
          <div className="text-xs text-gray-500">sessions</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-white">
            ${(project.total_cost_usd || 0).toFixed(3)}
          </div>
          <div className="text-xs text-gray-500">total cost</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-white">
            {tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens}
          </div>
          <div className="text-xs text-gray-500">tokens</div>
        </div>
        <div>
          <div className={`text-lg font-semibold ${project.flag_count > 0 ? 'text-red-400' : 'text-white'}`}>
            {project.flag_count}
          </div>
          <div className="text-xs text-gray-500">flags</div>
        </div>
      </div>

      {project.top_skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {project.top_skills.map(sk => (
            <span key={sk.name} className="flex items-center gap-1">
              <SkillPill name={sk.name} />
              <span className="text-gray-600 text-xs">×{sk.count}</span>
            </span>
          ))}
        </div>
      )}

      {project.top_skills.length === 0 && (
        <div className="text-xs text-gray-700 italic">No skills recorded yet</div>
      )}

      <div className="text-xs text-gray-700 mt-3">
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

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <span className="text-sm text-gray-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <div className="text-4xl mb-3">⬡</div>
          <div>No sessions recorded yet.</div>
          <div className="text-sm mt-1">Start Claude Code with Argus hooks installed.</div>
        </div>
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
