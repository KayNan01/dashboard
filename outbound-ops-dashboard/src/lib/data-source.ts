// Single data layer for the whole app.
//
// By default every read comes from the local, fictional `src/data/mockData.json`
// (see scripts/generate-mock-data.py). No database, internal server or private
// API is contacted.
//
// Optional: set VITE_API_BASE_URL (see .env.example) to point the three "live"
// panels at your own HTTPS API that returns the same raw JSON shape as the mock
// panels. History, correlation and shift state always stay local.

import mock from "@/data/mockData.json";
import { normalizeFastvision, type FastvisionRaw, type FastvisionRow } from "@/lib/fastvision";
import { normalizeFvOp, type FvOpRaw, type FvOpRow } from "@/lib/fastvision-operacional";
import { normalizePh, type PhRaw, type PhRow } from "@/lib/produtividade-hora";
import { initCorrelation, type CorrelationState } from "@/lib/correlation-engine";
import {
  PERIODS,
  buildOutboundTable,
  currentPeriodIndex,
  emptyDayState,
  hhmmToMin,
  saoPauloParts,
  type DayState,
  type OutboundRow,
} from "@/lib/outbound-logic";

interface MockHistoryCollaborator {
  name: string;
  pedidos: number;
  ativoMin: number;
  inativoMin: number;
  hub: number;
  terc: number;
  hourly: number[];
}

interface MockHistoryDay {
  daysAgo: number;
  pod: number;
  pendentes: number;
  periodCumulative: number[];
  periodTeam: number[];
  collaborators: MockHistoryCollaborator[];
}

interface MockData {
  collaborators: { name: string; hubShare: number }[];
  productivityPanel: FastvisionRaw[];
  hourlyPanel: PhRaw[];
  operationalPanel: FvOpRaw[];
  outboundToday: { pod: number; pendentes: number; periodTeam: number[] };
  history: MockHistoryDay[];
}

const data = mock as unknown as MockData;

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "";
export const DATA_MODE: "mock" | "api" = API_BASE ? "api" : "mock";

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, "0")}h`);

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// ---- "Live" simulation --------------------------------------------------
// Each refresh adds a few orders so the dashboard visibly moves like a real feed.
let liveTick = 0;
function liveBoost(seed: number): number {
  return Math.floor(liveTick * (1 + (seed % 4)));
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchLiveProductivity(): Promise<{ rows: FastvisionRow[]; fetchedAt: string }> {
  if (DATA_MODE === "api") {
    const raw = await getJson<FastvisionRaw[]>("/productivity");
    return { rows: normalizeFastvision(raw), fetchedAt: new Date().toISOString() };
  }
  await delay();
  liveTick += 1;
  const raw = data.productivityPanel.map((r, i) => ({
    ...r,
    VALOR: Number(r.VALOR ?? 0) + liveBoost(i),
  }));
  return { rows: normalizeFastvision(raw), fetchedAt: new Date().toISOString() };
}

export async function fetchOperational(): Promise<{ rows: FvOpRow[]; fetchedAt: string }> {
  if (DATA_MODE === "api") {
    const raw = await getJson<FvOpRaw[]>("/operational");
    return { rows: normalizeFvOp(raw), fetchedAt: new Date().toISOString() };
  }
  await delay();
  const [, mm, dd] = saoPauloParts().date.split("-");
  const raw = data.operationalPanel.map((r) => ({ ...r, DADO: `${dd}/${mm}` }));
  return { rows: normalizeFvOp(raw), fetchedAt: new Date().toISOString() };
}

export async function fetchHourlyLive(): Promise<PhRow[]> {
  if (DATA_MODE === "api") return normalizePh(await getJson<PhRaw[]>("/hourly"));
  await delay();
  return normalizePh(data.hourlyPanel);
}

// ---- History (mock days are anchored relative to "today") -----------------

function dateDaysAgo(daysAgo: number): string {
  const d = new Date(`${saoPauloParts().date}T12:00:00`);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function historyDays(): (MockHistoryDay & { date: string })[] {
  return data.history.map((h) => ({ ...h, date: dateDaysAgo(h.daysAgo) }));
}

export async function listHistoryDates(): Promise<string[]> {
  await delay(100);
  return historyDays().map((d) => d.date).sort((a, b) => (a < b ? 1 : -1));
}

export interface HistoryProductivityRow {
  date: string;
  colaborador: string;
  pedidos: number;
  ativo_min: number;
  inativo_min: number;
  hub: number;
  terc: number;
}

export interface HistoryOutboundDay {
  date: string;
  pod: number;
  pendentes: number;
  total_realizado: number;
  total_expedido: number;
  produtividade_media: number;
  linhas: OutboundRow[];
}

function outboundForDay(day: MockHistoryDay & { date: string }): HistoryOutboundDay {
  const state: DayState = emptyDayState(day.date);
  PERIODS.forEach((p, i) => {
    state.equipe[p.label] = day.periodTeam[i] ?? 0;
    state.acumuladoFrozen[p.label] = day.periodCumulative[i] ?? 0;
  });
  const total = day.periodCumulative[day.periodCumulative.length - 1] ?? 0;
  state.pendentes = day.pendentes;
  state.lastTotal = total;
  state.lastActivityMin = hhmmToMin("22:50");
  const table = buildOutboundTable(state, total, day.pod, hhmmToMin("23:59"));
  return {
    date: day.date,
    pod: day.pod,
    pendentes: table.pendentes,
    total_realizado: table.totalRealizado,
    total_expedido: table.totalExpedido,
    produtividade_media: Math.round(table.produtividadeMedia),
    linhas: table.rows,
  };
}

export async function fetchHistoryRange(
  start: string,
  end: string,
): Promise<{ prod: HistoryProductivityRow[]; out: HistoryOutboundDay[] }> {
  await delay(150);
  const days = historyDays()
    .filter((d) => d.date >= start && d.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const prod = days.flatMap((d) =>
    d.collaborators.map((c) => ({
      date: d.date,
      colaborador: c.name,
      pedidos: c.pedidos,
      ativo_min: c.ativoMin,
      inativo_min: c.inativoMin,
      hub: c.hub,
      terc: c.terc,
    })),
  );
  return { prod, out: days.map(outboundForDay) };
}

export async function fetchHourlyHistory(date: string): Promise<PhRow[]> {
  await delay(120);
  const day = historyDays().find((d) => d.date === date);
  if (!day) return [];
  return day.collaborators.flatMap((c) =>
    c.hourly
      .map((q, i) => ({ colaborador: c.name, hora: HOURS[i], quantidade: q }))
      .filter((r) => r.quantidade > 0),
  );
}

// ---- Correlation (HUB vs third-party split per collaborator) --------------

export async function fetchCorrelationState(): Promise<CorrelationState> {
  const { rows } = await fetchLiveProductivity();
  const shares = new Map(data.collaborators.map((c) => [c.name, c.hubShare]));
  const state = initCorrelation(saoPauloParts().date);
  for (const r of rows) {
    const share = shares.get(r.name) ?? 0.5;
    const identified = Math.round(r.pedidos * 0.9);
    const hub = Math.round(identified * share);
    const terc = identified - hub;
    state.attribution[r.name] = {
      hub,
      terc,
      total: identified,
      hubPct: identified > 0 ? (hub / identified) * 100 : 0,
      tercPct: identified > 0 ? (terc / identified) * 100 : 0,
    };
  }
  state.confidence = 0.87;
  state.lastMatchAt = Date.now() - 45_000;
  return state;
}

// ---- Outbound shift state -----------------------------------------------

/**
 * Builds a believable "today" state for the Outbound table the first time the
 * demo is opened (the browser then keeps it in localStorage).
 */
export function seedOutboundState(date: string, totalPedidos: number): DayState {
  const state = emptyDayState(date);
  const now = saoPauloParts().minutes;
  const curIdx = currentPeriodIndex(now);
  PERIODS.forEach((p, i) => {
    state.equipe[p.label] = data.outboundToday.periodTeam[i] ?? 0;
  });
  const ended = curIdx === PERIODS.length ? PERIODS.length : Math.max(0, curIdx);
  // Distribute what was already picked across the periods that already ended
  // (plus the one in progress), proportionally to their duration.
  const weights = PERIODS.slice(0, ended + (curIdx >= 0 && curIdx < PERIODS.length ? 1 : 0)).map(
    (p) => hhmmToMin(p.end) - hhmmToMin(p.start),
  );
  const totalW = weights.reduce((s, w) => s + w, 0) || 1;
  let acc = 0;
  for (let i = 0; i < ended; i++) {
    acc += weights[i];
    state.acumuladoFrozen[PERIODS[i].label] = Math.round((totalPedidos * acc) / totalW);
  }
  state.pendentes = data.outboundToday.pendentes;
  state.lastTotal = totalPedidos;
  state.lastActivityMin = now;
  return state;
}
