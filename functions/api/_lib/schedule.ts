// Schedule config normalization + time maths, shared by the admin matches
// endpoint and the public single-event endpoint so the two never drift.

export interface ScheduleConfig {
  courts: number
  sets_per_match: 1 | 3 | 5
  slot_minutes: number
  timed_only: boolean
  double_round_robin: boolean
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  courts: 2,
  sets_per_match: 3,
  slot_minutes: 45,
  timed_only: false,
  double_round_robin: false,
}

export function readScheduleConfig(rawJson: string | null): ScheduleConfig {
  let cfg: Record<string, unknown> = {}
  try {
    cfg = rawJson ? (JSON.parse(rawJson) as Record<string, unknown>) : {}
  } catch {
    cfg = {}
  }
  const spm = cfg.sets_per_match
  return {
    courts:
      typeof cfg.courts === 'number' && cfg.courts >= 1
        ? Math.floor(cfg.courts)
        : DEFAULT_SCHEDULE_CONFIG.courts,
    sets_per_match: spm === 1 || spm === 3 || spm === 5 ? spm : DEFAULT_SCHEDULE_CONFIG.sets_per_match,
    slot_minutes:
      typeof cfg.slot_minutes === 'number' && cfg.slot_minutes >= 1
        ? Math.floor(cfg.slot_minutes)
        : DEFAULT_SCHEDULE_CONFIG.slot_minutes,
    timed_only: Boolean(cfg.timed_only),
    double_round_robin: Boolean(cfg.double_round_robin),
  }
}

// event.start_time is a "YYYY-MM-DDTHH:MM" wall-clock string; add whole
// minutes without a timezone shifting it. Returns null for a malformed input
// rather than throwing.
export function addMinutes(dt: string | null | undefined, minutes: number): string | null {
  if (!dt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dt)) return null
  const [datePart, timePart] = dt.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, hh, mm))
  if (Number.isNaN(base.getTime())) return null
  base.setUTCMinutes(base.getUTCMinutes() + minutes)
  return base.toISOString().slice(0, 16)
}
