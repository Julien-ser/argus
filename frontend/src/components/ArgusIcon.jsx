export default function ArgusIcon({ size = 22 }) {
  const w = Math.round(size * (300 / 180))
  const outer = [0,20,40,60,80,100,120,140,160,180,200,220,240,260,280,300,320,340]
  const mid   = [10,36,72,108,144,180,216,252,288,324]

  return (
    <svg
      viewBox="190 88 300 180"
      width={w}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g transform="translate(340,178)">
        <path
          d="M-150,0 C-100,-90 100,-90 150,0 C100,90 -100,90 -150,0 Z"
          fill="#F1EFE8"
          stroke="#B4B2A9"
          strokeWidth="1"
        />
        {outer.map(a => (
          <g key={a} transform={`rotate(${a}) translate(118,0)`}>
            <ellipse rx="8" ry="5" fill="white" stroke="#888780" strokeWidth="0.5"/>
            <ellipse rx="4.5" ry="3.5" fill="#378ADD"/>
            <ellipse rx="2" ry="2" fill="#042C53"/>
          </g>
        ))}
        {mid.map(a => (
          <g key={a} transform={`rotate(${a}) translate(72,0)`}>
            <ellipse rx="6" ry="4" fill="white" stroke="#888780" strokeWidth="0.5"/>
            <ellipse rx="3.5" ry="3" fill="#185FA5"/>
            <ellipse rx="1.5" ry="1.5" fill="#042C53"/>
          </g>
        ))}
        <circle r="38" fill="#0D4A8A"/>
        <circle r="34" fill="none" stroke="#185FA5" strokeWidth="0.5" opacity="0.5"/>
        <circle r="28" fill="none" stroke="#378ADD" strokeWidth="0.5" opacity="0.4"/>
        <circle r="18" fill="#0a0a0a"/>
        <circle cx="-8" cy="-10" r="6" fill="white" opacity="0.18"/>
        <circle cx="-6" cy="-8" r="2.5" fill="white" opacity="0.35"/>
      </g>
    </svg>
  )
}
