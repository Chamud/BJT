import { useStore } from '../store'
import { setSpeed } from '../tts'

export const SPEEDS = [1, 1.25, 1.5, 2]

/** 1× / 1.25× / 1.5× / 2× — saved in settings and applied instantly to whatever is playing. */
export default function SpeedButtons({ onChange }: { onChange?: (r: number) => void }) {
  const rate = useStore().settings.speechRate
  return (
    <span className="speeds" role="group" aria-label="playback speed">
      {SPEEDS.map(r => (
        <button key={r} className={`speed ${Math.abs(rate - r) < 0.01 ? 'on' : ''}`}
          onClick={e => { e.stopPropagation(); setSpeed(r); onChange?.(r) }}>{r}×</button>
      ))}
    </span>
  )
}
