import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'

function severity(flag) {
  const r = (flag.flag_reason || '').toLowerCase()
  if (r.includes('rm -rf') || r.includes('curl | bash') || r.includes('sudo')) return 'critical'
  if (r.includes('outside') || r.includes('high') || r.includes('cost')) return 'warning'
  return 'info'
}

const SEV_BORDER = {
  critical: 'border-red-800 bg-red-950',
  warning:  'border-yellow-800 bg-yellow-950',
  info:     'border-blue-800 bg-blue-950',
}
const SEV_BADGE = {
  critical: 'bg-red-900 text-red-200',
  warning:  'bg-yellow-900 text-yellow-200',
  info:     'bg-blue-900 text-blue-200',
}

function formatJson(str) {
  try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
}

export default function Flags() {
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/flags`)
      .then(r => r.json())
      .then(d => { setFlags(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Security Flags</h1>

      {flags.length === 0 && (
        <div className="text-gray-500 text-sm bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          No flagged events. All clear.
        </div>
      )}

      <div className="space-y-3">
        {flags.map(flag => {
          const sev = severity(flag)
          const name = flag.project_path
            ? (flag.project_path.split('/').pop() || flag.project_path.split('\\').pop())
            : flag.session_id?.slice(0, 8)

          return (
            <div key={flag.id} className={`border rounded-lg p-4 ${SEV_BORDER[sev]}`}>
              <div className="flex items-start gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${SEV_BADGE[sev]}`}>
                  {sev}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium">{flag.tool_name || flag.type}</span>
                  </div>
                  <div className="text-sm mb-2 text-gray-300">{flag.flag_reason}</div>
                  <div className="text-xs text-gray-500">
                    <Link to={`/sessions/${flag.session_id}`} className="underline hover:text-gray-300">
                      {name}
                    </Link>
                    {' · '}
                    {new Date(flag.timestamp).toLocaleString()}
                  </div>
                  {flag.tool_input && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                        Tool input
                      </summary>
                      <pre className="mt-1 text-xs bg-black bg-opacity-30 rounded p-2 overflow-auto max-h-32 text-gray-300 whitespace-pre-wrap">
                        {formatJson(flag.tool_input)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
