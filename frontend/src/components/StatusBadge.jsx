const STYLES = {
  active:      'text-green-400',
  completed:   'text-gray-500',
  interrupted: 'text-amber-400',
}

export default function StatusBadge({ status }) {
  const cls = STYLES[status] || 'text-gray-500'
  return (
    <span className={`text-xs flex items-center gap-1.5 ${cls}`}>
      <span className="text-[8px] leading-none">●</span>
      {status}
    </span>
  )
}
