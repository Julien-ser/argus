import EventRow from './EventRow.jsx'

export default function TraceTree({ session, events, subagents = [] }) {
  return (
    <div className="space-y-2">
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <div className="bg-gray-900 px-3 py-2 text-xs text-gray-500 font-mono flex items-center gap-2">
          <span className="text-indigo-400">◆</span>
          <span className="truncate">{session.project_path || session.id}</span>
          <span className="ml-auto shrink-0">{events.length} events</span>
        </div>
        <div className="space-y-1 p-1">
          {events.map(e => <EventRow key={e.id} event={e} />)}
        </div>
      </div>

      {subagents.map(sub => (
        <div key={sub.session.id} className="ml-6 border-l-2 border-indigo-900 pl-4">
          <TraceTree session={sub.session} events={sub.events} subagents={sub.children || []} />
        </div>
      ))}
    </div>
  )
}
