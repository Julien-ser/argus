export default function TrustBadge({ score }) {
  if (score == null) return <span className="text-gray-600 text-xs font-mono">—</span>
  const cls =
    score >= 80 ? 'text-green-400' :
    score >= 50 ? 'text-yellow-400' :
                  'text-red-400'
  return <span className={`font-mono text-xs font-medium ${cls}`}>{score.toFixed(1)}</span>
}
