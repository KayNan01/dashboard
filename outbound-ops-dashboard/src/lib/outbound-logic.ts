// Lógica pura da tabela "Gestão Operacional Outbound".
// Pure functions shared by the UI and the mock data layer.

export interface Period {
  label: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export const DAY_PERIODS: Period[] = [
  { label: "08:00 - 09:00", start: "08:00", end: "09:00" },
  { label: "09:00 - 10:00", start: "09:00", end: "10:00" },
  { label: "10:00 - 11:30", start: "10:00", end: "11:30" },
  { label: "11:30 - 13:00", start: "11:30", end: "13:00" },
  { label: "13:00 - 14:30", start: "13:00", end: "14:30" },
  { label: "14:30 - 16:30", start: "14:30", end: "16:30" },
  { label: "16:30 - 17:30", start: "16:30", end: "17:30" },
];
export const NIGHT_PERIODS: Period[] = [
  { label: "20:00 - 21:00", start: "20:00", end: "21:00" },
  { label: "21:00 - 22:00", start: "21:00", end: "22:00" },
  { label: "22:00 - 23:00", start: "22:00", end: "23:00" },
];
export const PERIODS: Period[] = [...DAY_PERIODS, ...NIGHT_PERIODS];
export const DAY_LAST_IDX = DAY_PERIODS.length - 1;

// Pedidos planejados por colaborador a cada 30 min
export const PRIMEIRO_HORARIO_POR_30MIN = 73;
export const DEMAIS_HORARIOS_POR_30MIN = 95;

export function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function slots30min(p: Period): number {
  return Math.max(0.5, (hhmmToMin(p.end) - hhmmToMin(p.start)) / 30);
}

export function currentPeriodIndex(min: number): number {
  if (min < hhmmToMin(PERIODS[0].start)) return -1;
  for (let i = 0; i < PERIODS.length; i++) {
    if (min < hhmmToMin(PERIODS[i].end)) return i;
  }
  return PERIODS.length;
}

export function lastPeriodEffectiveEnd(
  lastActivityMin: number | null,
  now: number,
): number | null {
  const t1630 = hhmmToMin("16:30");
  const t1645 = hhmmToMin("16:45");
  const t1715 = hhmmToMin("17:15");
  const t1730 = hhmmToMin("17:30");
  if (now < t1645) return null;
  const last = lastActivityMin ?? -1;
  if (last < t1630) return t1630;
  if (now < t1715) return null;
  if (last <= t1645) return hhmmToMin("17:00");
  if (now < t1730 && last <= t1715) return hhmmToMin("17:00");
  if (last > t1715) return t1730;
  return now >= t1730 ? t1730 : null;
}

export interface DayState {
  date: string;
  equipe: Record<string, number>;
  acumuladoFrozen: Record<string, number>;
  acumuladoOverride: Record<string, number>;
  pendentes: number;
  lastTotal: number;
  lastActivityMin: number | null;
  manualRows?: ManualOutboundRow[];
}

export interface ManualOutboundRow {
  label: string;
  start: string;
  end: string;
  /** null = manter cálculo automático */
  planejado: number | null;
  realizado: number | null;
  acumulado: number | null;
  equipe: number | null;
}

export function emptyDayState(date: string): DayState {
  return {
    date,
    equipe: {},
    acumuladoFrozen: {},
    acumuladoOverride: {},
    pendentes: 0,
    lastTotal: 0,
    lastActivityMin: null,
    manualRows: [],
  };
}

export interface OutboundRow {
  label: string;
  index: number;
  isNight: boolean;
  equipe: number;
  planejado: number;
  acumulado: number | null;
  realizado: number | null;
  pct: number;
  prodHH: number;
  encerrado: boolean;
}

export interface OutboundTable {
  rows: OutboundRow[];
  totalRealizado: number;
  produtividadeMedia: number;
  totalExpedido: number;
  pendentes: number;
  curIdx: number;
  lastEnd: number | null;
}

/**
 * Monta a tabela completa. `now` em minutos do dia (-1 = sem hora conhecida,
 * usado no SSR para evitar hydration mismatch).
 */
export function buildOutboundTable(
  state: DayState,
  totalPedidos: number,
  projTotal: number,
  now: number,
): OutboundTable {
  const manualRows = state.manualRows?.length === PERIODS.length ? state.manualRows : null;
  const activePeriods = manualRows
    ? manualRows.map((row) => ({ label: row.label, start: row.start, end: row.end }))
    : PERIODS;
  const curIdx = now >= 0
    ? (() => {
        if (now < hhmmToMin(activePeriods[0].start)) return -1;
        for (let i = 0; i < activePeriods.length; i++) {
          if (now < hhmmToMin(activePeriods[i].end)) return i;
        }
        return activePeriods.length;
      })()
    : -1;
  const lastEnd = now >= 0 ? lastPeriodEffectiveEnd(state.lastActivityMin, now) : null;

  const dayFirstActive = DAY_PERIODS.findIndex((p) => (state.equipe[p.label] ?? 0) > 0);
  const nightFirstIdx = NIGHT_PERIODS.findIndex((p) => (state.equipe[p.label] ?? 0) > 0);
  const nightFirstActiveAbs = nightFirstIdx === -1 ? -1 : DAY_PERIODS.length + nightFirstIdx;

  let accDay = 0;
  let accNight = 0;
  const base = activePeriods.map((p, i) => {
    const isNight = i >= DAY_PERIODS.length;
    const manual = manualRows?.[i];
    const key = PERIODS[i]?.label ?? p.label;
    const equipe = manual?.equipe ?? state.equipe[key] ?? state.equipe[p.label] ?? 0;
    const slots = slots30min(p);
    let planejadoPeriodo = 0;
    const firstActiveIdx = isNight ? nightFirstActiveAbs : dayFirstActive;
    if (equipe > 0 && firstActiveIdx >= 0) {
      const taxa = i === firstActiveIdx ? PRIMEIRO_HORARIO_POR_30MIN : DEMAIS_HORARIOS_POR_30MIN;
      planejadoPeriodo = equipe * taxa * slots;
    }
    let planejado: number;
    if (isNight) {
      accNight += planejadoPeriodo;
      planejado = Math.round(accNight);
    } else {
      accDay += planejadoPeriodo;
      planejado = i === DAY_LAST_IDX ? projTotal : Math.round(accDay);
    }
    if (manual?.planejado != null) planejado = manual.planejado;
    const encerrado =
      state.acumuladoFrozen[key] !== undefined ||
      curIdx > i ||
      curIdx === PERIODS.length ||
      (i === DAY_LAST_IDX && curIdx === i && lastEnd !== null);
    return { p, i, key, isNight, equipe, planejado, encerrado };
  });

  // Acumulado = total bipado até o fim do período.
  const acumuladoArr: (number | null)[] = base.map((r) => {
    const override = state.acumuladoOverride[r.key];
    if (override !== undefined) return override;
    const frozen = state.acumuladoFrozen[r.key];
    if (frozen !== undefined) return frozen;
    if (curIdx === r.i) return totalPedidos;
    if (curIdx > r.i || curIdx === PERIODS.length) return totalPedidos;
    return null;
  });

  let prev: number | null = null;
  const realizadoArr: (number | null)[] = acumuladoArr.map((acc) => {
    if (acc === null) return null;
    const diff = prev === null ? acc : acc - prev;
    prev = acc;
    return diff;
  });

  const rows: OutboundRow[] = base.map((r, i) => {
    const manual = manualRows?.[i];
    const acumulado = manual?.acumulado ?? acumuladoArr[i];
    const realizado = manual?.realizado ?? realizadoArr[i];
    const horasPeriodo = slots30min(r.p) * 0.5;
    return {
      label: r.p.label,
      index: r.i,
      isNight: r.isNight,
      equipe: r.equipe,
      planejado: r.planejado,
      acumulado,
      realizado,
      pct: r.planejado > 0 && acumulado !== null ? (acumulado / r.planejado) * 100 : 0,
      prodHH: r.equipe > 0 && realizado !== null ? realizado / r.equipe / horasPeriodo : 0,
      encerrado: r.encerrado,
    };
  });

  const totalRealizado =
    [...rows].reverse().find((row) => row.acumulado !== null)?.acumulado ?? 0;

  const ativos = rows.filter((r) => (r.realizado ?? 0) > 0 && r.equipe > 0);
  const produtividadeMedia =
    ativos.length > 0 ? ativos.reduce((s, r) => s + r.prodHH, 0) / ativos.length : 0;

  return {
    rows,
    totalRealizado,
    produtividadeMedia,
    totalExpedido: Math.max(0, totalRealizado - (state.pendentes || 0)),
    pendentes: state.pendentes || 0,
    curIdx,
    lastEnd,
  };
}

// ---- Helpers de data/hora no fuso de São Paulo (server + client) ----

export function saoPauloParts(d = new Date()): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(hour) * 60 + Number(parts.minute),
  };
}
