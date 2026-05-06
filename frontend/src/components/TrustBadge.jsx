export default function TrustBadge({ score }) {
  if (score == null) return <span className="text-gray-600 text-xs font-mono">—</span>
  const cls =
    score >= 80 ? 'bg-green-900 text-green-300' :
    score >= 50 ? 'bg-yellow-900 text-yellow-300' :
                  'bg-red-900 text-red-300'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${cls}`}>
      {score.toFixed(1)}
    </span>
  )
}
