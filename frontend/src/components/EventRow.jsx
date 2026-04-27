import { useState } from 'react'
import CostBadge from './CostBadge.jsx'

const TOOL_COLOR = {
  Bash:   'text-yellow-400',
  Read:   'text-blue-400',
  Write:  'text-green-400',
  Edit:   'text-green-400',
  Glob:   'text-purple-400',
  Grep:   'text-purple-400',
  Agent:  'text-indigo-400',
  WebFetch: 'text-cyan-400',
  WebSearch: 'text-cyan-400',
}

function formatJson(str) {
  try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
}

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
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="text-gray-600 font-mono text-xs w-4 text-center">{arrow}</span>
        <span className={`font-mono font-medium w-28 truncate shrink-0 ${color}`}>
          {event.tool_name || event.type}
        </span>
        {event.flagged && (
          <span className="text-red-400 text-xs truncate">{event.flag_reason}</span>
        )}
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

      {open && (
        <div className="px-3 pb-3 border-t border-gray-800 pt-2 space-y-2">
          {event.tool_input && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Input</div>
              <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">
                {formatJson(event.tool_input)}
              </pre>
            </div>
          )}
          {event.tool_output && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Output</div>
              <pre className="text-xs bg-gray-950 rounded p-2 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">
                {formatJson(event.tool_output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
