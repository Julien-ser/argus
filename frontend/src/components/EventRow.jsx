import { useState } from 'react'
import CostBadge from './CostBadge.jsx'

const TOOL_COLOR = {
  Bash:      'text-yellow-400',
  Read:      'text-blue-400',
  Write:     'text-green-400',
  Edit:      'text-green-400',
  Glob:      'text-purple-400',
  Grep:      'text-purple-400',
  Agent:     'text-indigo-400',
  WebFetch:  'text-cyan-400',
  WebSearch: 'text-cyan-400',
}

// ── per-tool input renderers ──────────────────────────────────────────────────

function BashInput({ p }) {
  return (
    <div className="bg-gray-950 rounded p-3 font-mono text-sm">
      <span className="text-green-400 select-none">$ </span>
      <span className="text-gray-100 whitespace-pre-wrap">{p.command}</span>
      {p.description && (
        <div className="text-gray-500 text-xs mt-1"># {p.description}</div>
      )}
    </div>
  )
}

function FilePathInput({ p, children }) {
  return (
    <div>
      <div className="text-xs text-gray-400 font-mono mb-2 truncate">{p.file_path}</div>
      {children}
    </div>
  )
}

function EditInput({ p }) {
  return (
    <FilePathInput p={p}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-red-400 mb-1">Before</div>
          <pre className="text-xs bg-red-950 border border-red-900 rounded p-2 overflow-auto max-h-40 text-red-200 whitespace-pre-wrap">
            {p.old_string ?? '—'}
          </pre>
        </div>
        <div>
          <div className="text-xs text-green-400 mb-1">After</div>
          <pre className="text-xs bg-green-950 border border-green-900 rounded p-2 overflow-auto max-h-40 text-green-200 whitespace-pre-wrap">
            {p.new_string ?? '—'}
          </pre>
        </div>
      </div>
    </FilePathInput>
  )
}

function WriteInput({ p }) {
  return (
    <FilePathInput p={p}>
      <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">
        {p.content}
      </pre>
    </FilePathInput>
  )
}

function GlobInput({ p }) {
  return (
    <div className="font-mono text-sm text-gray-200">
      <span className="text-purple-400">pattern: </span>{p.pattern}
      {p.path && <span className="text-gray-500 ml-3">in {p.path}</span>}
    </div>
  )
}

function GrepInput({ p }) {
  return (
    <div className="font-mono text-sm text-gray-200 space-y-1">
      <div><span className="text-purple-400">pattern: </span>{p.pattern}</div>
      {p.path  && <div><span className="text-gray-500">path:    </span>{p.path}</div>}
      {p.glob  && <div><span className="text-gray-500">glob:    </span>{p.glob}</div>}
      {p.type  && <div><span className="text-gray-500">type:    </span>{p.type}</div>}
    </div>
  )
}

function AgentInput({ p }) {
  return (
    <div className="space-y-2">
      {p.description && (
        <div className="text-xs text-indigo-300 font-medium">{p.description}</div>
      )}
      {p.prompt && (
        <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-40 text-gray-300 whitespace-pre-wrap">
          {p.prompt}
        </pre>
      )}
    </div>
  )
}

function WebInput({ p }) {
  return (
    <div className="font-mono text-sm text-cyan-300 break-all">
      {p.url || p.query}
    </div>
  )
}

function GenericInput({ raw }) {
  return (
    <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">
      {raw}
    </pre>
  )
}

function ToolInput({ toolName, raw }) {
  if (!raw) return null
  let p
  try { p = JSON.parse(raw) } catch { return <GenericInput raw={raw} /> }

  switch (toolName) {
    case 'Bash':      return <BashInput p={p} />
    case 'Edit':      return <EditInput p={p} />
    case 'Write':     return <WriteInput p={p} />
    case 'Read':      return <FilePathInput p={p}><div className="text-xs text-gray-500">{p.offset != null ? `lines ${p.offset}–${p.offset + (p.limit ?? 2000)}` : 'full file'}</div></FilePathInput>
    case 'Glob':      return <GlobInput p={p} />
    case 'Grep':      return <GrepInput p={p} />
    case 'Agent':     return <AgentInput p={p} />
    case 'WebFetch':
    case 'WebSearch': return <WebInput p={p} />
    default:          return <GenericInput raw={JSON.stringify(p, null, 2)} />
  }
}

// ── output renderer ───────────────────────────────────────────────────────────

function ToolOutput({ toolName, raw }) {
  if (!raw) return null

  let p
  try { p = JSON.parse(raw) } catch { return <GenericOutput text={raw} /> }

  // Bash — show stdout/stderr cleanly
  if (toolName === 'Bash') {
    const text = p.output ?? p.stdout ?? (typeof p === 'string' ? p : null)
    const err  = p.stderr
    const code = p.exit_code ?? p.exitCode
    return (
      <div className="space-y-1">
        {code != null && code !== 0 && (
          <div className="text-xs text-red-400">exit code {code}</div>
        )}
        {text && <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">{text}</pre>}
        {err  && <pre className="text-xs bg-red-950 rounded p-2 overflow-auto max-h-24 text-red-300 whitespace-pre-wrap">{err}</pre>}
      </div>
    )
  }

  // Read — show file content directly
  if (toolName === 'Read') {
    const text = p.content ?? p.output ?? (typeof p === 'string' ? p : null)
    if (text) return <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">{text}</pre>
  }

  // Glob / Grep — list of results
  if (toolName === 'Glob' || toolName === 'Grep') {
    const files = Array.isArray(p) ? p : (p.files ?? p.matches ?? p.results)
    if (Array.isArray(files)) {
      return (
        <div className="font-mono text-xs space-y-0.5 max-h-48 overflow-auto">
          {files.length === 0
            ? <span className="text-gray-500">no matches</span>
            : files.map((f, i) => <div key={i} className="text-gray-300">{typeof f === 'string' ? f : JSON.stringify(f)}</div>)
          }
        </div>
      )
    }
  }

  // fallback — pretty JSON
  return <GenericOutput text={typeof p === 'string' ? p : JSON.stringify(p, null, 2)} />
}

function GenericOutput({ text }) {
  return (
    <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">
      {text}
    </pre>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function EventRow({ event }) {
  const [open, setOpen] = useState(false)
  const color = TOOL_COLOR[event.tool_name] || 'text-gray-400'
  const arrow = event.type === 'tool_call' ? '→' : event.type === 'tool_result' ? '←' : '·'

  return (
    <div
      onClick={() => setOpen(o => !o)}
      className={`border rounded text-sm cursor-pointer transition-colors ${
        event.flagged
          ? 'border-red-800 bg-red-950 hover:bg-red-900'
          : 'border-gray-800 bg-gray-900 hover:bg-gray-800'
      }`}
    >
      {/* row summary */}
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="text-gray-600 font-mono text-xs w-4 text-center">{arrow}</span>
        <span className={`font-mono font-medium w-28 truncate shrink-0 ${color}`}>
          {event.tool_name || event.type}
        </span>
        {event.flagged && (
          <span className="text-red-400 text-xs truncate">{event.flag_reason}</span>
        )}
        {/* inline summary for common tools */}
        {!event.flagged && event.tool_input && <RowSummary event={event} />}
        <div className="flex-1" />
        {event.duration_ms > 0 && (
          <span className="text-gray-600 text-xs shrink-0">{event.duration_ms}ms</span>
        )}
        <CostBadge cost={event.cost_usd} />
        <span className="text-gray-600 text-xs w-20 text-right shrink-0">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
        <span className="text-gray-700 text-xs">{open ? '▲' : '▼'}</span>
      </div>

      {/* expanded detail */}
      {open && (
        <div className="px-3 pb-3 border-t border-gray-800 pt-3 space-y-3" onClick={e => e.stopPropagation()}>
          {event.tool_input && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Input</div>
              <ToolInput toolName={event.tool_name} raw={event.tool_input} />
            </div>
          )}
          {event.tool_output && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Output</div>
              <ToolOutput toolName={event.tool_name} raw={event.tool_output} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// one-line summary shown in the collapsed row
function RowSummary({ event }) {
  try {
    const p = JSON.parse(event.tool_input)
    let text = null
    switch (event.tool_name) {
      case 'Bash':      text = p.command?.split('\n')[0]; break
      case 'Read':
      case 'Write':
      case 'Edit':      text = p.file_path; break
      case 'Glob':      text = p.pattern; break
      case 'Grep':      text = `/${p.pattern}/`; break
      case 'WebFetch':  text = p.url; break
      case 'WebSearch': text = p.query; break
      case 'Agent':     text = p.description; break
    }
    if (!text) return null
    return <span className="text-gray-500 text-xs truncate">{text}</span>
  } catch {
    return null
  }
}
