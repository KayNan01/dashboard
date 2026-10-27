// Operational filter fed by the WMS order-status panel.
// Cada item da base traz: TITULO (transportadora),
// DESCRICAO ("<CLASSIFICAÇÃO> - <STATUS>", ex.: "NORMAL - AG. SEPARAÇÃO"),
// VALOR (contagem). Esta camada normaliza, agrupa por transportadora e
// classifica em HUB / TERCEIRIZADAS, separando NORMAL x PERSONALIZAÇÃO.

export type OpStatus = "ONDA" | "AG" | "SEP" | "FAT" | "FAT_C" | "FAT_S";
export type OpTipo = "NORMAL" | "PERSONALIZACAO";
export type OpCanal = "COLMEIA" | "EXPRESS";

export interface FvOpRaw {
  TITULO?: string;
  DESCRICAO?: string;
  VALOR?: number | string;
  VALORCOCKPIT?: number | string;
  ORDEM?: number | string;
  DADO?: string;
  [k: string]: unknown;
}

export interface FvOpRow {
  ordem: number;
  titulo: string;
  display: string;
  grupo: "HUB" | "TERCEIRIZADAS";
  descricao: string;
  status: OpStatus;
  tipo: OpTipo;
  canal: OpCanal | null;
  valor: number;
  valorCockpit: number;
  dado: string;
}

export interface FvOpAggr {
  display: string;
  grupo: "HUB" | "TERCEIRIZADAS";
  agOnda: number;
  agOndaNormal: number;
  agOndaPerso: number;
  agOndaColmeia: number;
  agOndaExpress: number;
  agSeparacao: number;
  agSepNormal: number;
  agSepPerso: number;
  agSepColmeia: number;
  agSepExpress: number;
  separacaoConcluida: number;
  sepNormal: number;
  sepPerso: number;
  sepColmeia: number;
  sepExpress: number;
  faturado: number;
  fatNormal: number;
  fatPerso: number;
  fatColmeia: number;
  fatExpress: number;
  faturadoCCarga: number;
  fatCNormal: number;
  fatCPerso: number;
  fatCColmeia: number;
  fatCExpress: number;
  faturadoSCarga: number;
  fatSNormal: number;
  fatSPerso: number;
  fatSColmeia: number;
  fatSExpress: number;
  normal: number;
  personalizacao: number;
  colmeia: number;
  express: number;
  total: number;
  sacasHub: number;
  sacasHubPedidos: number;
}

export interface FvOpMetrics {
  porTransportadora: FvOpAggr[];
  hubTotals: FvOpAggr;
  terceirizadasTotals: FvOpAggr;
  totals: FvOpAggr;
  sacasHub: { pedidos: number; media: number; sacas: number };
  dado: string;
}

const HUB_MAP: { display: string; matches: string[] }[] = [
  { display: "ORBITA", matches: ["orbita"] },
  {
    display: "SWIFTLANE",
    matches: [
      "swiftlane",
      "swiftlane express logistica ltda",
    ],
  },
  { display: "NORTHLINE", matches: ["nlx", "northline"] },
  { display: "VELOCE", matches: ["veloce"] },
  { display: "CRX CORELOG", matches: ["crx corelog", "crxcorelog", "crx", "corelog"] },
  { display: "METRO ENTREGAS SP", matches: ["metro entregas sp", "metro entregas"] },
];

const RENAME_MAP: { display: string; matches: string[] }[] = [
  { display: "MARKETPLACE", matches: ["marketplace envios", "marketplace"] },
  { display: "BAZAAR", matches: ["bzr tecnologia", "bzr", "bazaar"] },
];

function cleanRaw(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\-–—_.,;:|/\\]+$/g, "")
    .trim();
}

function norm(s: string): string {
  return cleanRaw(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classify(transportadora: string): { display: string; grupo: "HUB" | "TERCEIRIZADAS" } {
  const n = norm(transportadora);
  for (const h of HUB_MAP) {
    if (h.matches.some((m) => n === m || n.includes(m))) {
      return { display: h.display, grupo: "HUB" };
    }
  }
  for (const r of RENAME_MAP) {
    if (r.matches.some((m) => n === m || n.includes(m))) {
      return { display: r.display, grupo: "TERCEIRIZADAS" };
    }
  }
  return { display: cleanRaw(transportadora).toUpperCase(), grupo: "TERCEIRIZADAS" };
}

function classifyStatus(v: string): OpStatus | null {
  const s = norm(v).replace(/[.\s]/g, "");
  if (s.startsWith("agformacaoderomaneio") || s === "agonda") return "ONDA";
  if (s === "agseparacao") return "AG";
  if (s === "separacaoconcluida") return "SEP";
  if (s === "faturado") return "FAT";
  if (s === "faturadoc/carga" || s === "faturadoccarga") return "FAT_C";
  if (s === "faturados/carga" || s === "faturadoscarga") return "FAT_S";
  return null;
}

function classifyTipo(v: string): OpTipo | null {
  const t = norm(v);
  if (t === "normal") return "NORMAL";
  if (t === "personalizacao") return "PERSONALIZACAO";
  return null;
}

function classifyCanal(v: string): OpCanal | null {
  const t = norm(v);
  if (t === "colmeia") return "COLMEIA";
  if (t === "express") return "EXPRESS";
  return null;
}

// DESCRICAO chega no formato "<TIPO> - <STATUS>" (ex.: "NORMAL - AG. SEPARAÇÃO").
function splitDescricao(d: string): {
  tipo: OpTipo | null;
  status: OpStatus | null;
  canal: OpCanal | null;
} {
  // Aceita "<STATUS> - <TIPO> - <CANAL>", "<TIPO> - <STATUS>" e variações de ordem.
  const parts = d.split("-").map((x) => x.trim()).filter(Boolean);
  let tipo: OpTipo | null = null;
  let status: OpStatus | null = null;
  let canal: OpCanal | null = null;
  const rest: string[] = [];
  for (const part of parts) {
    const t = classifyTipo(part);
    if (t && !tipo) { tipo = t; continue; }
    const c = classifyCanal(part);
    if (c && !canal) { canal = c; continue; }
    rest.push(part);
  }
  // Status pode conter "/" (ex.: FATURADO C/CARGA), então tenta as sobras
  // isoladas e também recombinadas.
  for (const r of rest) {
    const st = classifyStatus(r);
    if (st) { status = st; break; }
  }
  if (!status && rest.length > 1) status = classifyStatus(rest.join("-"));
  return { tipo, status, canal };
}

export function normalizeFvOp(raw: FvOpRaw[]): FvOpRow[] {
  const out: FvOpRow[] = [];
  for (const r of raw ?? []) {
    const titulo = String(r.TITULO ?? "").trim();
    if (!titulo) continue;
    const descricao = String(r.DESCRICAO ?? "").trim();
    const { tipo, status, canal } = splitDescricao(descricao);
    if (!tipo || !status) continue;
    const { display, grupo } = classify(titulo);
    const n = norm(display);
    if (n.includes("fedex") || n.includes("retirar") || n.includes("legacy carrier")) continue;
    out.push({
      ordem: Number(r.ORDEM ?? 0) || 0,
      titulo,
      display,
      grupo,
      descricao,
      status,
      tipo,
      canal,
      valor: Number(r.VALOR ?? 0) || 0,
      valorCockpit: Number(r.VALORCOCKPIT ?? r.VALOR ?? 0) || 0,
      dado: String(r.DADO ?? "").trim(),
    });
  }
  return out;
}

const SACAS_MEDIA = 40;

function emptyAggr(display: string, grupo: "HUB" | "TERCEIRIZADAS"): FvOpAggr {
  return {
    display,
    grupo,
    agOnda: 0,
    agOndaNormal: 0,
    agOndaPerso: 0,
    agOndaColmeia: 0,
    agOndaExpress: 0,
    agSeparacao: 0,
    agSepNormal: 0,
    agSepPerso: 0,
    agSepColmeia: 0,
    agSepExpress: 0,
    separacaoConcluida: 0,
    sepNormal: 0,
    sepPerso: 0,
    sepColmeia: 0,
    sepExpress: 0,
    faturado: 0,
    fatNormal: 0,
    fatPerso: 0,
    fatColmeia: 0,
    fatExpress: 0,
    faturadoCCarga: 0,
    fatCNormal: 0,
    fatCPerso: 0,
    fatCColmeia: 0,
    fatCExpress: 0,
    faturadoSCarga: 0,
    fatSNormal: 0,
    fatSPerso: 0,
    fatSColmeia: 0,
    fatSExpress: 0,
    normal: 0,
    personalizacao: 0,
    colmeia: 0,
    express: 0,
    total: 0,
    sacasHub: 0,
    sacasHubPedidos: 0,
  };
}

export function computeFvOpMetrics(rows: FvOpRow[]): FvOpMetrics {
  const byKey = new Map<string, FvOpAggr>();
  for (const r of rows) {
    const key = `${r.grupo}::${r.display}`;
    const a = byKey.get(key) ?? emptyAggr(r.display, r.grupo);
    const isN = r.tipo === "NORMAL";
    const isP = r.tipo === "PERSONALIZACAO";
    const isC = r.canal === "COLMEIA";
    const isE = r.canal === "EXPRESS";
    if (r.status === "ONDA") {
      a.agOnda += r.valor;
      if (isN) a.agOndaNormal += r.valor;
      if (isP) a.agOndaPerso += r.valor;
      if (isC) a.agOndaColmeia += r.valor;
      if (isE) a.agOndaExpress += r.valor;
    }
    if (r.status === "AG") {
      a.agSeparacao += r.valor;
      if (isN) a.agSepNormal += r.valor;
      if (isP) a.agSepPerso += r.valor;
      if (isC) a.agSepColmeia += r.valor;
      if (isE) a.agSepExpress += r.valor;
    }
    if (r.status === "SEP") {
      a.separacaoConcluida += r.valor;
      if (isN) a.sepNormal += r.valor;
      if (isP) a.sepPerso += r.valor;
      if (isC) a.sepColmeia += r.valor;
      if (isE) a.sepExpress += r.valor;
    }
    if (r.status === "FAT") {
      a.faturado += r.valor;
      if (isN) a.fatNormal += r.valor;
      if (isP) a.fatPerso += r.valor;
      if (isC) a.fatColmeia += r.valor;
      if (isE) a.fatExpress += r.valor;
    }
    if (r.status === "FAT_C") {
      a.faturadoCCarga += r.valor;
      if (isN) a.fatCNormal += r.valor;
      if (isP) a.fatCPerso += r.valor;
      if (isC) a.fatCColmeia += r.valor;
      if (isE) a.fatCExpress += r.valor;
    }
    if (r.status === "FAT_S") {
      a.faturadoSCarga += r.valor;
      if (isN) a.fatSNormal += r.valor;
      if (isP) a.fatSPerso += r.valor;
      if (isC) a.fatSColmeia += r.valor;
      if (isE) a.fatSExpress += r.valor;
    }
    if (r.status === "ONDA" || r.status === "AG" || r.status === "SEP" || r.status === "FAT" || r.status === "FAT_C" || r.status === "FAT_S") {
      if (isN) a.normal += r.valor;
      if (isP) a.personalizacao += r.valor;
      if (isC) a.colmeia += r.valor;
      if (isE) a.express += r.valor;
    }
    // Faturado = Fat. C/Carga + Fat. S/Carga (consolida as duas colunas).
    a.faturado = a.faturadoCCarga + a.faturadoSCarga;
    a.fatNormal = a.fatCNormal + a.fatSNormal;
    a.fatPerso = a.fatCPerso + a.fatSPerso;
    a.fatColmeia = a.fatCColmeia + a.fatSColmeia;
    a.fatExpress = a.fatCExpress + a.fatSExpress;
    a.total = a.agOnda + a.agSeparacao + a.separacaoConcluida + a.faturado;
    byKey.set(key, a);
  }

  // Sacas HUB: total NORMAL (todas as etapas), exceto PERSONALIZAÇÃO.
  for (const a of byKey.values()) {
    if (a.grupo === "HUB") {
      a.sacasHubPedidos = a.normal;
      a.sacasHub = Math.ceil(a.sacasHubPedidos / SACAS_MEDIA);
    }
  }

  const porTransportadora = [...byKey.values()].sort((a, b) => {
    if (a.grupo !== b.grupo) return a.grupo === "HUB" ? -1 : 1;
    return b.total - a.total;
  });

  const sumKeys: (keyof FvOpAggr)[] = [
    "agOnda","agOndaNormal","agOndaPerso","agOndaColmeia","agOndaExpress",
    "agSeparacao","agSepNormal","agSepPerso","agSepColmeia","agSepExpress",
    "separacaoConcluida","sepNormal","sepPerso","sepColmeia","sepExpress",
    "faturado","fatNormal","fatPerso","fatColmeia","fatExpress",
    "faturadoCCarga","fatCNormal","fatCPerso","fatCColmeia","fatCExpress",
    "faturadoSCarga","fatSNormal","fatSPerso","fatSColmeia","fatSExpress",
    "normal","personalizacao","colmeia","express","total",
    "sacasHub","sacasHubPedidos",
  ];

  const sum = (filter: (r: FvOpAggr) => boolean, display: string, g: "HUB" | "TERCEIRIZADAS"): FvOpAggr => {
    const acc = emptyAggr(display, g);
    for (const r of porTransportadora.filter(filter)) {
      for (const k of sumKeys) (acc[k] as number) += r[k] as number;
    }
    return acc;
  };

  const hubTotals = sum((r) => r.grupo === "HUB", "HUB", "HUB");
  const terceirizadasTotals = sum((r) => r.grupo === "TERCEIRIZADAS", "TERCEIRIZADAS", "TERCEIRIZADAS");
  const totals = emptyAggr("TOTAL GERAL", "HUB");
  totals.display = "TOTAL GERAL";
  for (const k of sumKeys) {
    (totals[k] as number) = (hubTotals[k] as number) + (terceirizadasTotals[k] as number);
  }
  // Sacas só fazem sentido para HUB.
  totals.sacasHub = hubTotals.sacasHub;
  totals.sacasHubPedidos = hubTotals.sacasHubPedidos;

  const dado = rows.find((r) => r.dado)?.dado ?? "";

  return {
    porTransportadora,
    hubTotals,
    terceirizadasTotals,
    totals,
    sacasHub: {
      pedidos: hubTotals.sacasHubPedidos,
      media: SACAS_MEDIA,
      sacas: Math.ceil(hubTotals.sacasHubPedidos / SACAS_MEDIA),
    },
    dado,
  };
}

