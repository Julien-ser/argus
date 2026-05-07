import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'

function severity(flag) {
  const r = (flag.flag_reason || '').toLowerCase()
  if (r.includes('rm -rf') || r.includes('curl | bash') || r.includes('sudo')) return 'critical'
  if (r.includes('outside') || r.includes('high') || r.includes('cost')) return 'warning'
  return 'info'
}

const SEV = {
  critical: { border: 'border-l-red-500',   label: 'text-red-400' },
  warning:  { border: 'border-l-amber-500',  label: 'text-amber-400' },
  info:     { border: 'border-l-gray-600',   label: 'text-gray-500' },
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

  if (loading) return <div className="text-gray-600 text-sm py-8">Loading…</div>

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-xl font-semibold">Flags</h1>
        {flags.length > 0 && (
          <span className="text-sm text-gray-500">
            {flags.length} event{flags.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {flags.length === 0 ? (
        <p className="text-gray-600 text-sm py-12 border-t border-gray-800">
          No flagged events. All clear.
        </p>
      ) : (
        <div className="space-y-2">
          {flags.map(flag => {
            const sev = severity(flag)
            const { border, label } = SEV[sev]
            const name = flag.project_path
              ? (flag.project_path.split('/').pop() || flag.project_path.split('\\').pop())
              : flag.session_id?.slice(0, 8)

            return (
              <div key={flag.id} className={`border border-gray-800 border-l-4 ${border} rounded-lg p-4 bg-gray-900/60`}>
                <div className="flex items-start gap-3">
                  <span className={`text-[11px] font-medium uppercase tracking-wide shrink-0 mt-0.5 w-14 ${label}`}>
                    {sev}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium text-gray-200">
                        {flag.tool_name || flag.type}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 mb-2">{flag.flag_reason}</div>
                    <div className="text-[11px] text-gray-600 font-mono">
                      <Link to={`/sessions/${flag.session_id}`} className="hover:text-gray-400 underline">
                        {name}
                      </Link>
                      {' · '}
                      {new Date(flag.timestamp).toLocaleString()}
                    </div>
                    {flag.tool_input && (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 select-none">
                          Show input
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-950 rounded p-3 overflow-auto max-h-32 text-gray-400 whitespace-pre-wrap border border-gray-800">
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
      )}
    </div>
  )
}
