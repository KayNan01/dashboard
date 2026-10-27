// Hourly productivity fed by the WMS hourly panel.
// Cada registro traz TITULO (colaborador), DESCRICAO (período, ex. "08 - 09h")
// e VALOR (quantidade produzida). Aqui apenas normalizamos e pivotamos
// COLABORADOR + PERÍODO + VALOR -> COLABORADOR x HORAS.


/** Colunas fixas 08h..23h */
export const HORAS: string[] = Array.from({ length: 16 }, (_, i) =>
  String(i + 8).padStart(2, "0") + "h",
);

export interface PhRaw {
  TITULO?: string;
  DESCRICAO?: string;
  VALOR?: number | string;
  DADO?: string;
  [k: string]: unknown;
}

export interface PhRow {
  colaborador: string;
  hora: string; // "08h"
  quantidade: number;
}

/** "08 - 09h" -> "08h". Retorna null quando não for possível identificar. */
export function parseHora(descricao: string): string | null {
  const m = String(descricao ?? "").match(/(\d{1,2})\s*-\s*(\d{1,2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return null;
  return String(h).padStart(2, "0") + "h";
}

export function normalizePh(raw: PhRaw[]): PhRow[] {
  const acc = new Map<string, PhRow>();
  for (const r of raw ?? []) {
    const colaborador = String(r.TITULO ?? "").trim();
    if (!colaborador) continue;
    const hora = parseHora(String(r.DESCRICAO ?? ""));
    if (!hora) continue;
    const quantidade = Number(r.VALOR ?? 0) || 0;
    const key = `${colaborador}|${hora}`;
    const prev = acc.get(key);
    if (prev) prev.quantidade += quantidade;
    else acc.set(key, { colaborador, hora, quantidade });
  }
  return [...acc.values()];
}

export interface PhPivotRow {
  colaborador: string;
  horas: Record<string, number>;
  total: number;
}

export interface PhResumo {
  totalDia: number;
  maiorProdutividade: { colaborador: string; total: number } | null;
  horaMaisProdutiva: { hora: string; total: number } | null;
  mediaPorColaborador: number;
  porHora: Record<string, number>;
}

export function pivotPh(rows: PhRow[]): PhPivotRow[] {
  const map = new Map<string, PhPivotRow>();
  for (const r of rows) {
    let entry = map.get(r.colaborador);
    if (!entry) {
      entry = {
        colaborador: r.colaborador,
        horas: Object.fromEntries(HORAS.map((h) => [h, 0])),
        total: 0,
      };
      map.set(r.colaborador, entry);
    }
    if (!(r.hora in entry.horas)) entry.horas[r.hora] = 0;
    entry.horas[r.hora] += r.quantidade;
    entry.total += r.quantidade;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function resumoPh(pivot: PhPivotRow[]): PhResumo {
  const porHora: Record<string, number> = Object.fromEntries(HORAS.map((h) => [h, 0]));
  let totalDia = 0;
  for (const p of pivot) {
    totalDia += p.total;
    for (const h of HORAS) porHora[h] += p.horas[h] ?? 0;
  }
  const maior = pivot[0]
    ? { colaborador: pivot[0].colaborador, total: pivot[0].total }
    : null;
  let horaMaisProdutiva: { hora: string; total: number } | null = null;
  for (const h of HORAS) {
    if (!horaMaisProdutiva || porHora[h] > horaMaisProdutiva.total) {
      horaMaisProdutiva = { hora: h, total: porHora[h] };
    }
  }
  if (horaMaisProdutiva && horaMaisProdutiva.total === 0) horaMaisProdutiva = null;
  return {
    totalDia,
    maiorProdutividade: maior,
    horaMaisProdutiva,
    mediaPorColaborador: pivot.length > 0 ? totalDia / pivot.length : 0,
    porHora,
  };
}
