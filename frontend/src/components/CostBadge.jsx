import { money } from '../format.js'

export default function CostBadge({ cost }) {
  if (!cost) return <span className="text-gray-600 text-xs font-mono">$0</span>
  const color = cost > 1 ? 'text-red-400' : cost > 0.1 ? 'text-yellow-400' : 'text-gray-400'
  return <span className={`text-xs font-mono tabular-nums ${color}`}>{money(cost)}</span>
}
