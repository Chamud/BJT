import { useState } from 'react'
import type { ChartSpec } from '../types'

/** Small SVG chart: grouped bar, line, or donut. Hover shows exact values; a table view is always available. */
interface Props {
  spec: ChartSpec
  height?: number
  refLine?: { value: number; label: string }
  yMin?: number
  yMax?: number
  horizontal?: boolean
  showTableToggle?: boolean
  points?: boolean[] // line: per-series "dots only" flag
}

const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString() : String(+v.toFixed(2)))

export default function Chart({ spec, height = 240, refLine, yMin, yMax, horizontal, showTableToggle = true, points }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)
  const [table, setTable] = useState(false)
  const multi = spec.series.length > 1
  return (
    <figure className="chart">
      {spec.title && <figcaption className="chart-title">{spec.title}{spec.unit && <span className="muted">（単位：{spec.unit}）</span>}</figcaption>}
      {multi && spec.type !== 'pie' && (
        <div className="legend">
          {spec.series.map((s, i) => <span key={s.name}><i style={{ background: `var(--series-${i + 1})` }} />{s.name}</span>)}
        </div>
      )}
      {table ? <DataTable spec={spec} /> : (
        <div className="chart-plot" onMouseLeave={() => setHover(null)}>
          {spec.type === 'pie' ? <Donut spec={spec} setHover={setHover} />
            : spec.type === 'line' ? <Line spec={spec} h={height} refLine={refLine} yMin={yMin} yMax={yMax} setHover={setHover} points={points} />
            : horizontal ? <HBars spec={spec} setHover={setHover} yMax={yMax} refLine={refLine} />
            : <Bars spec={spec} h={height} setHover={setHover} refLine={refLine} />}
          {hover && <div className="tip" style={{ left: hover.x, top: hover.y }}>{hover.text}</div>}
        </div>
      )}
      {showTableToggle && <button className="link small" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>}
    </figure>
  )
}

type SetHover = (h: { x: number; y: number; text: string } | null) => void
const W = 560

function scale(spec: ChartSpec, yMin?: number, yMax?: number) {
  const all = spec.series.flatMap(s => s.values)
  const lo = yMin ?? Math.min(0, ...all)
  let hi = yMax ?? Math.max(...all)
  if (hi === lo) hi = lo + 1
  const step = niceStep((hi - lo) / 4)
  hi = yMax ?? Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(+t.toFixed(6))
  return { lo, hi, ticks }
}
function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function Axes({ ticks, y, w, left }: { ticks: number[]; y: (v: number) => number; w: number; left: number }) {
  return <g>{ticks.map(t => (
    <g key={t}>
      <line x1={left} x2={w} y1={y(t)} y2={y(t)} className="grid" />
      <text x={left - 6} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">{fmt(t)}</text>
    </g>))}</g>
}

function Bars({ spec, h, setHover, refLine }: { spec: ChartSpec; h: number; setHover: SetHover; refLine?: Props['refLine'] }) {
  const L = 44, B = 28, T = 8
  const { lo, hi, ticks } = scale(spec)
  const y = (v: number) => T + (h - B - T) * (1 - (v - lo) / (hi - lo))
  const band = (W - L) / spec.labels.length
  const ns = spec.series.length
  const bw = Math.min(36, (band * 0.7) / ns)
  return (
    <svg viewBox={`0 0 ${W} ${h}`} role="img">
      <Axes ticks={ticks} y={y} w={W} left={L} />
      {spec.labels.map((lab, i) => (
        <g key={lab}>
          {spec.series.map((s, j) => {
            const v = s.values[i]
            const x = L + band * i + (band - bw * ns - 2 * (ns - 1)) / 2 + j * (bw + 2)
            const y0 = y(Math.max(0, lo)), y1 = y(v)
            return <path key={s.name} d={roundTop(x, Math.min(y0, y1), bw, Math.abs(y0 - y1))} fill={`var(--series-${j + 1})`}
              onMouseMove={e => setHover(tip(e, `${lab}${ns > 1 ? ' · ' + s.name : ''}: ${fmt(v)}${spec.unit ?? ''}`))} />
          })}
          <text x={L + band * i + band / 2} y={h - 10} className="axis" textAnchor="middle">{lab}</text>
        </g>
      ))}
      {refLine && <RefLine y={y(refLine.value)} x1={L} x2={W} label={refLine.label} />}
    </svg>
  )
}

function HBars({ spec, setHover, yMax, refLine }: { spec: ChartSpec; setHover: SetHover; yMax?: number; refLine?: Props['refLine'] }) {
  const L = 110, R = 40, row = 26
  const h = spec.labels.length * row + 24
  const hi = yMax ?? Math.max(...spec.series[0].values, 1)
  const x = (v: number) => L + (W - L - R) * (v / hi)
  const s = spec.series[0]
  return (
    <svg viewBox={`0 0 ${W} ${h}`} role="img">
      {spec.labels.map((lab, i) => (
        <g key={lab} onMouseMove={e => setHover(tip(e, `${lab}: ${fmt(s.values[i])}${spec.unit ?? ''}`))}>
          <rect x={0} y={i * row} width={W} height={row} fill="transparent" />
          <text x={L - 8} y={i * row + row / 2} className="axis" textAnchor="end" dominantBaseline="middle">{lab}</text>
          <path d={roundRight(L, i * row + 6, Math.max(0, x(s.values[i]) - L), row - 12)} fill="var(--series-1)" />
          <text x={x(s.values[i]) + 6} y={i * row + row / 2} className="value" dominantBaseline="middle">{fmt(s.values[i])}{spec.unit}</text>
        </g>
      ))}
      {refLine && <><line x1={x(refLine.value)} x2={x(refLine.value)} y1={0} y2={h - 18} className="ref" />
        <text x={x(refLine.value)} y={h - 4} className="axis" textAnchor="middle">{refLine.label}</text></>}
    </svg>
  )
}

function Line({ spec, h, refLine, yMin, yMax, setHover, points }: { spec: ChartSpec; h: number; refLine?: Props['refLine']; yMin?: number; yMax?: number; setHover: SetHover; points?: boolean[] }) {
  const L = 44, B = 28, T = 8, R = 12
  const { lo, hi, ticks } = scale(spec, yMin, yMax)
  const y = (v: number) => T + (h - B - T) * (1 - (v - lo) / (hi - lo))
  const n = spec.labels.length
  const x = (i: number) => n === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (n - 1)
  const every = Math.ceil(n / 8)
  const [cross, setCross] = useState<number | null>(null)
  return (
    <svg viewBox={`0 0 ${W} ${h}`} role="img"
      onMouseMove={e => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        const px = ((e.clientX - r.left) / r.width) * W
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))))
        setCross(i)
        const vals = spec.series.map(s => Number.isFinite(s.values[i]) ? `${s.name}: ${fmt(s.values[i])}${spec.unit ?? ''}` : null).filter(Boolean)
        setHover(vals.length ? tip(e, `${spec.labels[i]} — ${vals.join(' · ')}`) : null)
      }}
      onMouseLeave={() => setCross(null)}>
      <Axes ticks={ticks} y={y} w={W - R} left={L} />
      {refLine && <RefLine y={y(refLine.value)} x1={L} x2={W - R} label={refLine.label} />}
      {cross !== null && <line x1={x(cross)} x2={x(cross)} y1={T} y2={h - B} className="cross" />}
      {spec.series.map((s, j) => {
        const pts = s.values.map((v, i) => [x(i), y(v), v] as const).filter(p => Number.isFinite(p[2]))
        return (
          <g key={s.name}>
            {!points?.[j] && <polyline points={pts.map(p => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke={`var(--series-${j + 1})`} strokeWidth={2} strokeLinejoin="round" />}
            {pts.map((p, i) => (points?.[j] || pts.length < 16) &&
              <circle key={i} cx={p[0]} cy={p[1]} r={points?.[j] ? 5 : 3.5} fill={`var(--series-${j + 1})`} stroke="var(--surface)" strokeWidth={2} />)}
          </g>
        )
      })}
      {spec.labels.map((lab, i) => i % every === 0 &&
        <text key={i} x={x(i)} y={h - 10} className="axis" textAnchor="middle">{lab}</text>)}
    </svg>
  )
}

function Donut({ spec, setHover }: { spec: ChartSpec; setHover: SetHover }) {
  const vals = spec.series[0].values
  const total = vals.reduce((a, b) => a + b, 0) || 1
  const cx = 130, cy = 120, r = 95, ri = 55
  let a0 = -Math.PI / 2
  return (
    <svg viewBox={`0 0 ${W} 240`} role="img">
      {vals.map((v, i) => {
        const a1 = a0 + (v / total) * Math.PI * 2
        const d = arc(cx, cy, r, ri, a0, a1)
        a0 = a1
        return <path key={i} d={d} fill={`var(--series-${(i % 8) + 1})`} stroke="var(--surface)" strokeWidth={2}
          onMouseMove={e => setHover(tip(e, `${spec.labels[i]}: ${fmt(v)}${spec.unit ?? ''} (${Math.round((v / total) * 100)}%)`))} />
      })}
      {spec.labels.map((lab, i) => (
        <g key={lab} transform={`translate(260 ${30 + i * 26})`}>
          <rect width={12} height={12} rx={3} fill={`var(--series-${(i % 8) + 1})`} />
          <text x={20} y={10} className="value">{lab}　{fmt(vals[i])}{spec.unit ?? ''}{spec.unit !== '%' && `（${Math.round((vals[i] / total) * 100)}%）`}</text>
        </g>
      ))}
    </svg>
  )
}

function DataTable({ spec }: { spec: ChartSpec }) {
  return (
    <table className="data">
      <thead><tr><th></th>{spec.series.map(s => <th key={s.name}>{s.name}</th>)}</tr></thead>
      <tbody>{spec.labels.map((l, i) => <tr key={l}><th>{l}</th>{spec.series.map(s => <td key={s.name}>{Number.isFinite(s.values[i]) ? fmt(s.values[i]) : '–'}</td>)}</tr>)}</tbody>
    </table>
  )
}

const RefLine = ({ y, x1, x2, label }: { y: number; x1: number; x2: number; label: string }) =>
  <g><line x1={x1} x2={x2} y1={y} y2={y} className="ref" /><text x={x2 - 4} y={y - 5} className="axis" textAnchor="end">{label}</text></g>

function tip(e: React.MouseEvent, text: string) {
  const box = (e.currentTarget as Element).closest('.chart-plot')!.getBoundingClientRect()
  return { x: e.clientX - box.left + 12, y: e.clientY - box.top - 30, text }
}
function roundTop(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}
function roundRight(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h / 2, w)
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`
}
function arc(cx: number, cy: number, r: number, ri: number, a0: number, a1: number) {
  const big = a1 - a0 > Math.PI ? 1 : 0
  const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 -= 1e-4
  return `M${p(r, a0)}A${r},${r} 0 ${big} 1 ${p(r, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${big} 0 ${p(ri, a0)}Z`
}
