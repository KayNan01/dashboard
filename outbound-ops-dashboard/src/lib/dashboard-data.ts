import Papa from "papaparse";

export interface OrderRow {
  colaborador: string;
  date: Date; // full timestamp
  hora: number; // 0-23 (extracted)
  horas_trabalhadas: number;
}

export interface DashboardData {
  rows: OrderRow[];
  fileName: string;
}

// ---- Helpers ----

// Decode bytes as UTF-8 with fallback to latin1 (windows-1252) when invalid.
export function decodeBytes(buf: ArrayBuffer): string {
  try {
    const txt = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return txt;
  } catch {
    // Fallback: conversão automática a partir de windows-1252 quando o arquivo
    // não está em UTF-8. Mantemos um aviso no console para diagnóstico.
    console.warn(
      "[CSV] Arquivo não está em UTF-8. Aplicando conversão automática a partir de windows-1252."
    );
    return new TextDecoder("windows-1252").decode(buf);
  }
}

// Detect delimiter: prefer ';' if more frequent than ',' on the first line.
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > semis && tabs > commas) return "\t";
  return semis >= commas ? ";" : ",";
}

// Strip UTF-8 BOM if present.
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// Normalize a header for matching: lowercase, no accents, no spaces/underscores.
function normKey(k: string): string {
  return k
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_\-]/g, "");
}

function pickColumn(row: Record<string, string>, candidates: string[]): string | undefined {
  const map = new Map<string, string>();
  for (const k of Object.keys(row)) map.set(normKey(k), k);
  for (const c of candidates) {
    const hit = map.get(normKey(c));
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

/**
 * Parse Brazilian date strings explicitly. NEVER use Date(string) auto-parsing.
 * Accepts:
 *   DD/MM/YYYY HH:mm:ss
 *   DD/MM/YYYY HH:mm
 *   DD/MM/YYYY
 *   DD-MM-YYYY [HH:mm[:ss]]
 *   YYYY-MM-DD HH:mm:ss   (ISO-like, day not inverted)
 */
export function parseBrDate(input: string): Date | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // ISO yyyy-mm-dd[ T]hh:mm[:ss]
  let m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    const [, Y, Mo, D, h = "0", mi = "0", se = "0"] = m;
    return new Date(+Y, +Mo - 1, +D, +h, +mi, +se);
  }

  // BR: dd/mm/yyyy or dd-mm-yyyy with optional time
  m = s.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    const [, D, Mo, Yraw, h = "0", mi = "0", se = "0"] = m;
    const Y = Yraw.length === 2 ? 2000 + +Yraw : +Yraw;
    const day = +D;
    const month = +Mo;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Y, month - 1, day, +h, +mi, +se);
  }
  return null;
}

// Format Date as BR padrão.
export function formatBrDate(d: Date, withTime = false): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (!withTime) return base;
  return `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function dateKey(d: Date): string {
  // YYYY-MM-DD (for grouping/sorting); display uses formatBrDate.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---- Sample ----


export const SAMPLE: DashboardData = {
  fileName: "",
  rows: [],
};
export const EMPTY_DATA: DashboardData = SAMPLE;

// ---- Productivity tiers (padronização global) ----
export const META_PRODUTIVIDADE = 190;
export type ProdTier = "success" | "warning" | "destructive";
export function productivityTier(prod: number): ProdTier {
  if (prod >= 190) return "success";
  if (prod >= 180) return "warning";
  return "destructive";
}
export function productivityColor(prod: number): string {
  return `var(--${productivityTier(prod)})`;
}

// ---- CSV parsing ----

export function parseCsv(text: string, fileName: string): DashboardData {
  const cleaned = stripBom(text);
  const delimiter = detectDelimiter(cleaned);
  const { data } = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });

  const rows: OrderRow[] = [];
  for (const r of data) {
    const colaborador = (
      pickColumn(r, [
        "Nome de Usuário",
        "Nome de Usuario",
        "Nome do Usuário",
        "Usuário",
        "Usuario",
        "colaborador",
        "nome",
        "user",
      ]) ?? ""
    ).trim();
    if (!colaborador) continue;

    const dtRaw =
      pickColumn(r, [
        "Data/Hora",
        "DataHora",
        "Data e Hora",
        "Data",
        "data",
        "datahora",
        "timestamp",
        "hora",
      ]) ?? "";
    const date = parseBrDate(dtRaw);
    if (!date) continue;

    const horasRaw = pickColumn(r, [
      "horas_trabalhadas",
      "Horas Trabalhadas",
      "horas",
      "Horas",
    ]);
    const horasParsed = horasRaw ? parseFloat(horasRaw.replace(",", ".")) : 8;
    const horas = isNaN(horasParsed) ? 8 : horasParsed;

    rows.push({
      colaborador,
      date,
      hora: date.getHours(),
      horas_trabalhadas: horas,
    });
  }

  // Sort chronologically.
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { rows, fileName };
}

// ---- Metrics ----

export interface MetricsFilters {
  user?: string; // "all" or specific
  from?: Date;
  to?: Date;
  hiddenUsers?: Set<string>;
}

// Merge a newly-uploaded CSV with the existing dataset.
// Strategy: any date (YYYY-MM-DD) present in the incoming CSV REPLACES the
// rows for that same date in the existing dataset. Dates not present in the
// incoming CSV are preserved, building up a multi-day history across uploads.
export function mergeData(
  existing: DashboardData,
  incoming: DashboardData,
  isSample: boolean,
): DashboardData {
  if (isSample) return incoming;
  const incomingDates = new Set(incoming.rows.map((r) => dateKey(r.date)));
  const kept = existing.rows.filter((r) => !incomingDates.has(dateKey(r.date)));
  const merged = [...kept, ...incoming.rows].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const existingNames = existing.fileName.split(" + ").filter(Boolean);
  const allNames = Array.from(new Set([...existingNames, incoming.fileName]));
  return { rows: merged, fileName: allNames.join(" + ") };
}

export function computeMetrics(d: DashboardData, filters: MetricsFilters = {}) {
  const rows = d.rows.filter((r) => {
    if (filters.user && filters.user !== "all" && r.colaborador !== filters.user) return false;
    if (filters.hiddenUsers && filters.hiddenUsers.has(r.colaborador)) return false;
    if (filters.from && r.date < filters.from) return false;
    if (filters.to && r.date > filters.to) return false;
    return true;
  });

  // Horas trabalhadas = soma dos intervalos REAIS entre registros consecutivos
  // do mesmo colaborador (ordenados cronologicamente). Gaps maiores que
  // MAX_GAP_MIN minutos são tratados como pausa (não somam). Exemplo: registros
  // às 08:43 e 09:01 contabilizam 18 minutos.
  const MAX_GAP_MIN = 30;
  const recordsByUser = new Map<string, Date[]>();
  const horasDoDiaPorUser = new Map<string, Set<number>>();
  for (const r of rows) {
    const arr = recordsByUser.get(r.colaborador) ?? [];
    arr.push(r.date);
    recordsByUser.set(r.colaborador, arr);

    const hset = horasDoDiaPorUser.get(r.colaborador) ?? new Set<number>();
    hset.add(r.date.getHours());
    horasDoDiaPorUser.set(r.colaborador, hset);
  }
  const minutosPorUser = new Map<string, number>();
  for (const [name, dates] of recordsByUser) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    let total = 0;
    for (let i = 1; i < dates.length; i++) {
      const gapMin = (dates[i].getTime() - dates[i - 1].getTime()) / 60000;
      if (gapMin > 0 && gapMin <= MAX_GAP_MIN) total += gapMin;
    }
    minutosPorUser.set(name, total);
  }

  // Regra de arredondamento: minutos restantes entre 55 e 59 contabilizam 1h.
  function formatHoras(totalMinRaw: number): { decimal: number; label: string } {
    const totalMin = Math.round(totalMinRaw);
    let h = Math.floor(totalMin / 60);
    let m = totalMin % 60;
    if (m >= 55) {
      h += 1;
      m = 0;
    }
    const decimal = h + m / 60;
    const label = m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
    return { decimal, label };
  }

  const byColab = new Map<string, { count: number }>();
  for (const r of rows) {
    const cur = byColab.get(r.colaborador) ?? { count: 0 };
    cur.count += 1;
    byColab.set(r.colaborador, cur);
  }
  const colaboradores = [...byColab.entries()]
    .map(([name, v]) => {
      const minutosRaw = minutosPorUser.get(name) ?? 0;
      const { decimal: horas, label: horasLabel } = formatHoras(minutosRaw);
      const minutos = Math.round(minutosRaw);
      const horasDoDia = [...(horasDoDiaPorUser.get(name) ?? new Set<number>())].sort((a, b) => a - b);
      // Produtividade proporcional em tempo real (pedidos/hora) baseada no
      // tempo ativo real. Mínimo de 1 minuto p/ evitar divisão por zero.
      // Ex.: 20 pedidos em 10 min => 120 pedidos/h.
      const horasEfetivas = Math.max(minutosRaw, 1) / 60;
      const produtividade = v.count / horasEfetivas;
      return {
        name,
        pedidos: v.count,
        horas,
        horasLabel,
        minutos,
        produtividade,
        extrapolada: minutosRaw < 60,
        horasDoDia,
        horasDoDiaLabels: horasDoDia.map((h) => `${String(h).padStart(2, "0")}h`),
      };
    })
    .sort((a, b) => b.pedidos - a.pedidos);
  const totalPedidos = rows.length;
  const totalMinutos = [...minutosPorUser.values()].reduce((s, m) => s + m, 0);
  const mediaEquipe = totalPedidos / (Math.max(totalMinutos, 1) / 60);
  const top = [...colaboradores].sort((a, b) => b.pedidos - a.pedidos)[0];
  const META = 190;
  const abaixoMeta = colaboradores.filter((c) => c.produtividade < META).length;

  // Gráfico por hora do dia: limitado entre 08h e 18h.
  const byHour: { hora: string; pedidos: number }[] = [];
  for (let h = 8; h <= 18; h++) {
    byHour.push({ hora: `${String(h).padStart(2, "0")}h`, pedidos: 0 });
  }
  for (const r of rows) {
    if (r.hora >= 8 && r.hora <= 18) byHour[r.hora - 8].pedidos += 1;
  }

  // Produtividade por dia (cronológica)
  const byDayMap = new Map<string, { key: string; label: string; date: Date; pedidos: number }>();
  for (const r of rows) {
    const key = dateKey(r.date);
    const cur =
      byDayMap.get(key) ??
      { key, label: formatBrDate(r.date), date: new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate()), pedidos: 0 };
    cur.pedidos += 1;
    byDayMap.set(key, cur);
  }
  const byDay = [...byDayMap.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

  const allUsers = [...new Set(d.rows.map((r) => r.colaborador))].sort();
  const allDates = d.rows.map((r) => r.date);
  const minDate = allDates.length ? allDates[0] : null;
  const maxDate = allDates.length ? allDates[allDates.length - 1] : null;

  return {
    totalPedidos,
    mediaEquipe,
    top,
    abaixoMeta,
    meta: META,
    colaboradores,
    top5: [...colaboradores].sort((a, b) => b.pedidos - a.pedidos).slice(0, 5),
    byHour,
    byDay,
    allUsers,
    minDate,
    maxDate,
  };
}
