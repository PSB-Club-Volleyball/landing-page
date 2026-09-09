// Schedule config normalization + time maths, shared by the admin matches
// endpoint and the public single-event endpoint so the two never drift.

export interface ScheduleConfig {
  courts: number
  sets_per_match: 1 | 3 | 5
  total_minutes: number
  timed_only: boolean
  double_round_robin: boolean
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  courts: 2,
  sets_per_match: 3,
  total_minutes: 180,
  timed_only: false,
  double_round_robin: false,
}

// `slotCount`, when known (the caller has the match rows), lets a legacy
// row that only stored per-slot `slot_minutes` be converted to the exact
// same wall-clock spacing it had before: total = slot_minutes * slotCount.
export function readScheduleConfig(rawJson: string | null, slotCount?: number): ScheduleConfig {
  let cfg: Record<string, unknown> = {}
  try {
    cfg = rawJson ? (JSON.parse(rawJson) as Record<string, unknown>) : {}
  } catch {
    cfg = {}
  }
  const spm = cfg.sets_per_match
  const legacySlot =
    typeof cfg.slot_minutes === 'number' && cfg.slot_minutes >= 1 ? Math.floor(cfg.slot_minutes) : null
  const total =
    typeof cfg.total_minutes === 'number' && cfg.total_minutes >= 1
      ? Math.floor(cfg.total_minutes)
      : legacySlot != null
        ? legacySlot * (slotCount && slotCount >= 1 ? slotCount : 4)
        : DEFAULT_SCHEDULE_CONFIG.total_minutes
  return {
    courts:
      typeof cfg.courts === 'number' && cfg.courts >= 1
        ? Math.floor(cfg.courts)
        : DEFAULT_SCHEDULE_CONFIG.courts,
    sets_per_match: spm === 1 || spm === 3 || spm === 5 ? spm : DEFAULT_SCHEDULE_CONFIG.sets_per_match,
    total_minutes: total,
    timed_only: Boolean(cfg.timed_only),
    double_round_robin: Boolean(cfg.double_round_robin),
  }
}

// Wall-clock start for the match in a given slot: slots divide total_minutes
// evenly, so slot 0 is at the event start and the last slot is at
// start + total_minutes * (slotCount - 1) / slotCount.
export function slotStartTime(
  eventStart: string | null | undefined,
  slot: number,
  slotCount: number,
  totalMinutes: number
): string | null {
  if (slotCount < 1) return addMinutes(eventStart, 0)
  const perSlot = totalMinutes / slotCount
  return addMinutes(eventStart, Math.round(slot * perSlot))
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
