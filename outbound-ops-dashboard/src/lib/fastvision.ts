// WMS productivity feed (per-collaborator panel).
// The panel returns an array of records describing
// productivity per collaborator (TITULO/VALOR) and active/inactive time
// hidden inside an HTML DESCRICAO blob.

export interface FastvisionRow {
  name: string;          // TITULO
  pedidos: number;       // VALOR
  ativoMin: number;      // parsed from DESCRICAO "Ativo: Xh Ymin"
  inativoMin: number;    // parsed from DESCRICAO "Inativo: Xh Ymin"
  ativoLabel: string;    // "0h 33min"
  inativoLabel: string;  // "0h 0min"
  dado?: string;         // DADO (ex: "03/06")
}

export interface FastvisionRaw {
  TITULO?: string;
  VALOR?: number | string;
  DESCRICAO?: string;
  DADO?: string;
  [k: string]: unknown;
}

const TIME_RE = /(\d+)\s*h\s*(\d+)\s*min/i;

function parseTime(segment: string): { min: number; label: string } {
  const m = segment.match(TIME_RE);
  if (!m) return { min: 0, label: "0h 0min" };
  const h = parseInt(m[1], 10) || 0;
  const mm = parseInt(m[2], 10) || 0;
  return { min: h * 60 + mm, label: `${h}h ${mm}min` };
}

export function parseDescricao(html: string): {
  ativoMin: number;
  inativoMin: number;
  ativoLabel: string;
  inativoLabel: string;
} {
  // Strip tags to simplify regex.
  const plain = (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // Split on "Inativo" so each side has a single time.
  const idx = plain.toLowerCase().indexOf("inativo");
  const ativoChunk = idx >= 0 ? plain.slice(0, idx) : plain;
  const inativoChunk = idx >= 0 ? plain.slice(idx) : "";
  const a = parseTime(ativoChunk);
  const i = parseTime(inativoChunk);
  return {
    ativoMin: a.min,
    inativoMin: i.min,
    ativoLabel: a.label,
    inativoLabel: i.label,
  };
}

export function normalizeFastvision(raw: FastvisionRaw[]): FastvisionRow[] {
  const out: FastvisionRow[] = [];
  for (const r of raw ?? []) {
    const name = String(r.TITULO ?? "").trim();
    if (!name) continue;
    const pedidos = Number(r.VALOR ?? 0) || 0;
    const d = parseDescricao(String(r.DESCRICAO ?? ""));
    out.push({
      name,
      pedidos,
      ativoMin: d.ativoMin,
      inativoMin: d.inativoMin,
      ativoLabel: d.ativoLabel,
      inativoLabel: d.inativoLabel,
      dado: r.DADO ? String(r.DADO) : undefined,
    });
  }
  return out;
}

export const META_PRODUTIVIDADE = 190;

export interface FvColaborador {
  name: string;
  pedidos: number;
  ativoMin: number;
  inativoMin: number;
  ativoLabel: string;
  inativoLabel: string;
  horas: number;          // decimal hours (active)
  horasLabel: string;     // friendly label
  minutos: number;        // active minutes (alias of ativoMin)
  produtividade: number;  // pedidos/h based on active time
  extrapolada: boolean;
  horasDoDia: number[];
  horasDoDiaLabels: string[];
}

export interface FvMetrics {
  totalPedidos: number;
  mediaEquipe: number;
  top: { name: string; pedidos: number } | undefined;
  abaixoMeta: number;
  meta: number;
  colaboradores: FvColaborador[];
  top5: FvColaborador[];
  byHour: { hora: string; pedidos: number }[];
  byDay: { key: string; label: string; date: Date; pedidos: number }[];
  allUsers: string[];
  minDate: Date | null;
  maxDate: Date | null;
}

export interface FvFilters {
  user?: string;
  hiddenUsers?: Set<string>;
}

function fmtHoras(totalMin: number): { decimal: number; label: string } {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const decimal = h + m / 60;
  const label = m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
  return { decimal, label };
}

export function computeFastvisionMetrics(
  rows: FastvisionRow[],
  filters: FvFilters = {},
): FvMetrics {
  const allUsers = [...new Set(rows.map((r) => r.name))].sort();

  const filtered = rows.filter((r) => {
    if (filters.user && filters.user !== "all" && r.name !== filters.user) return false;
    if (filters.hiddenUsers?.has(r.name)) return false;
    return true;
  });

  const colaboradores: FvColaborador[] = filtered
    .map((r) => {
      const minutosRaw = r.ativoMin;
      const { decimal: horas, label: horasLabel } = fmtHoras(minutosRaw);
      const horasEfetivas = Math.max(minutosRaw, 1) / 60;
      const produtividade = r.pedidos / horasEfetivas;
      return {
        name: r.name,
        pedidos: r.pedidos,
        ativoMin: r.ativoMin,
        inativoMin: r.inativoMin,
        ativoLabel: r.ativoLabel,
        inativoLabel: r.inativoLabel,
        horas,
        horasLabel,
        minutos: minutosRaw,
        produtividade,
        extrapolada: minutosRaw < 60,
        horasDoDia: [],
        horasDoDiaLabels: [],
      };
    })
    .sort((a, b) => b.pedidos - a.pedidos);

  const totalPedidos = colaboradores.reduce((s, c) => s + c.pedidos, 0);
  const totalMin = colaboradores.reduce((s, c) => s + c.ativoMin, 0);
  const mediaEquipe = totalPedidos / (Math.max(totalMin, 1) / 60);
  const top = colaboradores[0];
  const abaixoMeta = colaboradores.filter((c) => c.produtividade < META_PRODUTIVIDADE).length;

  return {
    totalPedidos,
    mediaEquipe,
    top: top ? { name: top.name, pedidos: top.pedidos } : undefined,
    abaixoMeta,
    meta: META_PRODUTIVIDADE,
    colaboradores,
    top5: colaboradores.slice(0, 5),
    byHour: [],
    byDay: [],
    allUsers,
    minDate: null,
    maxDate: null,
  };
}

