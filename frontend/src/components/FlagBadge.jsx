export default function FlagBadge({ count }) {
  if (!count) return <span className="text-gray-700 text-xs">—</span>
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-red-950 text-red-300 font-medium">
      ⚑ {count}
    </span>
  )
}
