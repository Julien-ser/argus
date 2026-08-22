import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../App.jsx'

const SEV_STYLE = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  high:     'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low:      'text-sky-400 bg-sky-500/10 border-sky-500/30',
  info:     'text-gray-400 bg-gray-500/10 border-gray-600/40',
}

function Cell({ column, value, row }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-700">—</span>
  }
  if (column === 'severity') {
    const style = SEV_STYLE[String(value).toLowerCase()] || SEV_STYLE.info
    return (
      <span className={`px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-wide ${style}`}>
        {value}
      </span>
    )
  }
  if (column === 'timestamp') {
    return <span className="text-gray-400">{String(value).replace('T', ' ').slice(0, 19)}</span>
  }
  if (column === 'session_id' && row?.session_id) {
    return (
      <Link to={`/sessions/${row.session_id}`} className="text-indigo-400 hover:text-indigo-300">
        {String(value).slice(0, 8)}
      </Link>
    )
  }
  if (typeof value === 'number') {
    return <span className="tabular-nums">{Number.isInteger(value) ? value : value.toFixed(4)}</span>
  }
  const text = String(value)
  return <span title={text.length > 80 ? text : undefined}>{text.length > 80 ? text.slice(0, 80) + '…' : text}</span>
}

export default function Search() {
  const [query, setQuery] = useState('flagged=true | sort -severity')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [help, setHelp] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/search/help`).then(r => r.json()).then(setHelp).catch(() => {})
  }, [])

  async function runQuery(q = query) {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`)
      const data = await r.json()
      if (!r.ok) {
        setError(data.detail || 'Query failed')
        setResult(null)
      } else {
        setResult(data)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runQuery() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); runQuery() }
  }

  function useExample(q) {
    setQuery(q)
    runQuery(q)
    inputRef.current?.focus()
  }

  const columns = result?.columns || []

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-5">
        <h1 className="text-xl font-semibold">Search</h1>
        <span className="text-sm text-gray-500">agent telemetry, queried like a SIEM</span>
        <button
          onClick={() => setShowHelp(v => !v)}
          className="ml-auto text-[13px] text-gray-500 hover:text-gray-200"
        >
          {showHelp ? 'hide reference' : 'query reference'}
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <textarea
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          rows={2}
          placeholder="tool=Bash severity>=high | stats count by command"
          className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 font-mono text-[13px]
                     text-gray-100 focus:outline-none focus:border-indigo-500 resize-y"
        />
        <button
          onClick={() => runQuery()}
          disabled={loading}
          className="px-4 self-stretch bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                     rounded text-sm font-medium"
        >
          {loading ? '…' : 'Run'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-red-300 text-[13px]">
          {error}
        </div>
      )}

      {showHelp && help && (
        <div className="mb-5 p-4 rounded border border-gray-800 bg-gray-900/60 text-[13px] space-y-3">
          <div>
            <div className="text-gray-500 mb-1">Operators</div>
            <div className="font-mono text-gray-300">{help.operators.join('   ')}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Commands</div>
            <div className="font-mono text-gray-300">{help.commands.join('   ')}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Fields</div>
            <div className="font-mono text-gray-300 leading-relaxed">{help.fields.join('   ')}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Time</div>
            <div className="font-mono text-gray-300">earliest=-24h   latest=-10m   earliest=2026-08-01</div>
          </div>
        </div>
      )}

      {help && (
        <div className="flex flex-wrap gap-2 mb-6">
          {help.examples.map(ex => (
            <button
              key={ex.query}
              onClick={() => useExample(ex.query)}
              title={ex.query}
              className="px-2.5 py-1 rounded border border-gray-800 bg-gray-900 text-[12px]
                         text-gray-400 hover:text-gray-100 hover:border-gray-600"
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}

      {result && (
        <>
          <div className="text-[13px] text-gray-500 mb-2">
            {result.matched} event{result.matched !== 1 ? 's' : ''} matched
            {result.kind === 'stats' && ' · aggregated'}
            {result.truncated && ` · showing first ${result.returned}`}
          </div>

          {result.rows.length === 0 ? (
            <div className="text-gray-600 text-sm py-8">No results.</div>
          ) : (
            <div className="overflow-x-auto border border-gray-800 rounded">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-gray-900/80 text-gray-500">
                    {columns.map(c => (
                      <th key={c} className="text-left font-normal px-3 py-2 whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-800/70 hover:bg-gray-900/40">
                      {columns.map(c => (
                        <td key={c} className="px-3 py-1.5 align-top">
                          <Cell column={c} value={row[c]} row={row} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
