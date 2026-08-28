/**
 * Number formatting, in one place.
 *
 * Previously cost was rendered with toFixed(2), toFixed(3) and toFixed(4)
 * depending on which page you were on, and token counts were abbreviated in
 * exactly one component and shown raw everywhere else. That inconsistency was
 * also a layout bug: on the Projects cards `$3.258` and `630.8k` were wide
 * enough to collide, rendering as `$3.258630.8k`.
 *
 * Rules:
 *   - precision follows magnitude, so a $0.004 tool call and a $3.26 project
 *     total are both readable without one of them becoming `$0.00`
 *   - abbreviate tokens above 10k without a misleading decimal (631k, not 630.8k)
 *   - pair with `tabular-nums` so columns line up
 */

/** Cost. Adaptive precision: per-event values keep their digits, totals don't. */
export function money(value) {
  const n = Number(value) || 0
  if (n === 0) return '$0'
  if (n < 0.01) return `$${n.toFixed(4)}`   // a single tool call
  if (n < 1) return `$${n.toFixed(3)}`      // a session
  return `$${n.toFixed(2)}`                 // a project or a day
}

/** Token counts. 631k rather than 630.8k — the decimal implies precision we don't have. */
export function tokens(value) {
  const n = Number(value) || 0
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** Durations, for trace rows. */
export function duration(ms) {
  const n = Number(ms) || 0
  if (n >= 60_000) return `${Math.floor(n / 60_000)}m ${Math.round((n % 60_000) / 1000)}s`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}s`
  return `${n}ms`
}
