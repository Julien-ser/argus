export default function FlagBadge({ count }) {
  if (!count) return <span className="text-gray-700 text-xs">—</span>
  return <span className="font-mono text-xs text-red-400">⚑ {count}</span>
}
