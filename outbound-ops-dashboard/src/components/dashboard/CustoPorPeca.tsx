import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, Upload, Truck, DollarSign, Package, X } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CsvRow {
  qtde: number;
  transportadora: string;
  serie: string;
  processadoEm: string; // sempre dd/mm/yyyy literal
}

const HUB_TRANSPORTADORAS = [
  "VELOCE",
  "NLX",
  "SWIFTLANE EXPRESS LOGISTICA LTDA",
  "ORBITA",
  "CRX CORELOG",
  "CORELOG",
];

const ML_FULL_TRANSPORTADORA = "RETIRAR";
const ML_FULL_SERIES = new Set(["70", "070"]);

const STORAGE_ROWS = "custoPeca.rows";
const STORAGE_CFG = "custoPeca.cfg";

function normalize(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeHeader(s: string): string {
  return normalize(s).replace(/\s+/g, " ");
}

function isQtdeTotalProdutoHeader(h: string): boolean {
  return h.replace(/\./g, "") === "QTDE TOTAL DE PRODUTO";
}

function isTransportadoraHeader(h: string): boolean {
  return h === "TRANSPORTADORA";
}

function isSerieHeader(h: string): boolean {
  return h === "SERIE" || /^S.?RIE$/.test(h);
}

function isProcessadoEmHeader(h: string): boolean {
  return h === "PROCESSADO EM";
}

function detectDelimiter(line: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = line.split(c).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim().replace(/^"|"$/g, ""));
}

function parseNumber(raw: string): number {
  if (!raw) return 0;
  const s = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toDateBR(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${d}/${mo}/${y}`;
}

// O CSV "Processado em" vem como dd/mm/yyyy (com ou sem hora). Sempre retorna dd/mm/yyyy literal.
function parseDate(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return "";
  const [, d, mo, rawYear] = m;
  let y = rawYear;
  if (y.length === 2) y = "20" + y;
  const day = Number(d);
  const month = Number(mo);
  const year = Number(y);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return "";
  if (day < 1 || day > 31 || month < 1 || month > 12) return "";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function parseCsv(text: string): { rows: CsvRow[]; error?: string } {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], error: "CSV vazio." };

  // Procura, dentro das primeiras linhas, uma linha que contenha todos os cabeçalhos esperados.
  // CSV pode não estar formatado como Tabela: cabeçalho pode não ser a primeira linha.
  let headerLineIdx = -1;
  let headers: string[] = [];
  let delim = ",";
  let idxQtde = -1;
  let idxTransp = -1;
  let idxSerie = -1;
  let idxProc = -1;

  const maxScan = Math.min(lines.length, 20);
  for (let li = 0; li < maxScan; li++) {
    const d = detectDelimiter(lines[li]);
    const cols = parseCsvLine(lines[li], d).map(normalizeHeader);
    const q = cols.findIndex(isQtdeTotalProdutoHeader);
    const t = cols.findIndex(isTransportadoraHeader);
    const s = cols.findIndex(isSerieHeader);
    const p = cols.findIndex(isProcessadoEmHeader);
    if (q >= 0 && t >= 0 && s >= 0 && p >= 0) {
      headerLineIdx = li;
      headers = cols;
      delim = d;
      idxQtde = q;
      idxTransp = t;
      idxSerie = s;
      idxProc = p;
      break;
    }
  }

  if (headerLineIdx < 0) {
    const preview = parseCsvLine(lines[0], detectDelimiter(lines[0])).map(normalizeHeader);
    return {
      rows: [],
      error: `Colunas obrigatórias não encontradas. Cabeçalhos lidos: ${preview.join(" | ")}`,
    };
  }

  const rows: CsvRow[] = [];
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim);
    if (cols.length < headers.length) continue;
    rows.push({
      qtde: parseNumber(cols[idxQtde]),
      transportadora: (cols[idxTransp] || "").trim(),
      serie: (cols[idxSerie] || "").trim(),
      processadoEm: parseDate(cols[idxProc] || ""),
    });
  }
  return { rows };
}

function parseCsvBuffer(buffer: ArrayBuffer): { rows: CsvRow[]; error?: string } {
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const utf8Result = parseCsv(utf8Text);
  if (!utf8Result.error) return utf8Result;

  const hasBrokenAccents = utf8Text.includes("�");
  if (hasBrokenAccents) {
    const latinText = new TextDecoder("windows-1252").decode(buffer);
    const latinResult = parseCsv(latinText);
    if (!latinResult.error) return latinResult;
  }

  return utf8Result;
}

interface Config {
  modeloCaminhao: string;
  custoPorCaminhao: number;
  qtdCaminhoes: number;
}

const DEFAULT_CFG: Config = {
  modeloCaminhao: "",
  custoPorCaminhao: 0,
  qtdCaminhoes: 1,
};

export function CustoPorPeca() {
  // allRows = dataset original imutável vindo do CSV. Nunca é sobrescrito pelo filtro.
  const [allRows, setAllRows] = useState<CsvRow[]>([]);
  const [cfg, setCfg] = useState<Config>(DEFAULT_CFG);
  const [selectedDates, setSelectedDates] = useState<Date[] | undefined>(undefined);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted state
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const r = window.localStorage.getItem(STORAGE_ROWS);
      if (r) {
        const parsed = JSON.parse(r);
        if (Array.isArray(parsed)) setAllRows(parsed);
      }
      const c = window.localStorage.getItem(STORAGE_CFG);
      if (c) {
        const parsed = JSON.parse(c);
        if (parsed && typeof parsed === "object") setCfg({ ...DEFAULT_CFG, ...parsed });
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_ROWS, JSON.stringify(allRows));
  }, [allRows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_CFG, JSON.stringify(cfg));
  }, [cfg]);

  // Conjunto de dias selecionados como string dd/mm/yyyy.
  // null = nenhum filtro → usa dataset completo.
  const dateSet = useMemo(() => {
    if (!selectedDates || selectedDates.length === 0) return null;
    return new Set(selectedDates.map(toDateBR));
  }, [selectedDates]);

  // filteredRows = SEMPRE derivado de allRows, nunca substitui o original.
  const filteredRows = useMemo(() => {
    if (!dateSet) return allRows;
    return allRows.filter((r) => r.processadoEm && dateSet.has(r.processadoEm));
  }, [allRows, dateSet]);

  const metrics = useMemo(() => {
    let hub = 0;
    let mlFull = 0;
    const hubNorm = HUB_TRANSPORTADORAS.map(normalize);
    for (const r of filteredRows) {
      const t = normalize(r.transportadora);
      const qty = r.qtde || 0;
      if (hubNorm.some((h) => t === h || t.startsWith(h) || h.startsWith(t))) {
        hub += qty;
      }
      if (t === ML_FULL_TRANSPORTADORA && ML_FULL_SERIES.has(r.serie.trim())) {
        mlFull += qty;
      }
    }
    const total = hub + mlFull;
    const custoTotal = (cfg.qtdCaminhoes || 0) * (cfg.custoPorCaminhao || 0);
    const custoPorPeca = total > 0 ? custoTotal / total : 0;
    return { hub, mlFull, total, custoTotal, custoPorPeca };
  }, [filteredRows, cfg]);

  function handleFile(file: File) {
    setCsvError(null);
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const { rows: parsed, error } = parseCsvBuffer(buffer);
      if (error) {
        setCsvError(error);
        return;
      }
      setAllRows(parsed);
    };
    reader.onerror = () => setCsvError("Falha ao ler arquivo.");
    reader.readAsArrayBuffer(file);
  }

  function clearCsv() {
    setAllRows([]);
    setCsvFileName("");
    setCsvError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  const fmtInt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border bg-card/60 p-4 text-card-foreground shadow-sm backdrop-blur space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold flex items-center gap-2">
            <Package className="size-4 text-primary" />
            Custo por Peça / Transferência
          </h3>
          <p className="text-[11px] text-muted-foreground">
            HUB + ML Full filtrados do CSV · custo total dos caminhões ÷ total de peças
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className="gap-2"
          >
            <Upload className="size-3.5" />
            {allRows.length > 0 ? "Reenviar CSV" : "Importar CSV"}
          </Button>
          {csvFileName && (
            <span
              className="text-[11px] text-muted-foreground truncate max-w-[180px]"
              title={csvFileName}
            >
              {csvFileName} · {allRows.length} linhas
            </span>
          )}
          {allRows.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearCsv}
              className="gap-1 text-destructive"
            >
              <X className="size-3.5" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {csvError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
          {csvError}
        </div>
      )}

      {/* Calendário */}
      <div className="flex flex-wrap items-end gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="size-3.5" />
              {selectedDates && selectedDates.length > 0
                ? `${selectedDates.length} dia(s) selecionado(s)`
                : "Todas as datas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
            <Calendar
              mode="multiple"
              selected={selectedDates}
              onSelect={setSelectedDates}
              locale={ptBR}
              className={cn("p-3 pointer-events-auto")}
            />
            {selectedDates && selectedDates.length > 0 && (
              <div className="border-t p-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setSelectedDates(undefined)}>
                  Limpar datas
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {selectedDates && selectedDates.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            Filtrando {filteredRows.length} de {allRows.length} linhas
          </span>
        )}
      </div>

      {/* Configuração caminhões */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Modelo do caminhão
          </span>
          <input
            type="text"
            value={cfg.modeloCaminhao}
            onChange={(e) => setCfg({ ...cfg, modeloCaminhao: e.target.value })}
            placeholder="Ex: VUC, Toco, Truck"
            className="h-9 rounded-lg border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Custo por Caminhão (R$)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={cfg.custoPorCaminhao}
            onChange={(e) =>
              setCfg({ ...cfg, custoPorCaminhao: Math.max(0, parseFloat(e.target.value || "0")) })
            }
            className="h-9 rounded-lg border bg-background px-3 text-right font-mono text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Qtd. de caminhões
          </span>
          <input
            type="number"
            min={0}
            step="1"
            value={cfg.qtdCaminhoes}
            onChange={(e) =>
              setCfg({ ...cfg, qtdCaminhoes: Math.max(0, parseInt(e.target.value || "0", 10)) })
            }
            className="h-9 rounded-lg border bg-background px-3 text-right font-mono text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </div>

      {/* Resultado */}
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        <ResultCard
          label="Total Geral"
          value={fmtInt(metrics.total)}
          hint="peças (HUB + ML Full)"
          tone="primary"
          icon={Package}
        />
        <ResultCard label="HUB" value={fmtInt(metrics.hub)} hint="peças" tone="info" icon={Truck} />
        <ResultCard
          label="ML Full"
          value={fmtInt(metrics.mlFull)}
          hint="peças"
          tone="warning"
          icon={Truck}
        />
        <ResultCard
          label="Custo total caminhões"
          value={fmtBRL(metrics.custoTotal)}
          hint={`${cfg.qtdCaminhoes} × ${fmtBRL(cfg.custoPorCaminhao)}`}
          tone="caution"
          icon={DollarSign}
        />
        <ResultCard
          label="Custo por Peça"
          value={metrics.total > 0 ? fmtBRL(metrics.custoPorPeca) : "N/A"}
          hint={
            metrics.total > 0
              ? `${fmtBRL(metrics.custoTotal)} ÷ ${fmtInt(metrics.total)}`
              : "sem peças"
          }
          tone="success"
          icon={DollarSign}
        />
      </div>

      {allRows.length === 0 && !csvError && (
        <p className="text-[11px] text-muted-foreground">
          Faça upload de um CSV contendo as colunas: <strong>Qtde. Total de Produto</strong>,{" "}
          <strong>Transportadora</strong>, <strong>Série</strong>, <strong>Processado em</strong>.
        </p>
      )}
    </div>
  );
}

function ResultCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "info" | "success" | "warning" | "caution";
  icon: typeof Package;
}) {
  const tones: Record<string, string> = {
    primary: "from-primary/20 to-primary/5 text-primary border-primary/30",
    info: "from-sky-500/20 to-sky-500/5 text-sky-400 border-sky-500/30",
    success: "from-success/20 to-success/5 text-success border-success/30",
    warning: "from-warning/20 to-warning/5 text-warning border-warning/30",
    caution: "from-orange-500/20 to-orange-500/5 text-orange-400 border-orange-500/30",
  };
  return (
    <div
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-br p-3 shadow-sm ${tones[tone]}`}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80 break-words whitespace-normal min-w-0">
          {label}
        </p>
        <Icon className="size-4 opacity-90 shrink-0" />
      </div>
      <p className="mt-1 font-display text-base sm:text-lg font-bold tracking-tight text-foreground break-words whitespace-normal leading-tight tabular-nums min-w-0">
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground break-words whitespace-normal min-w-0">
          {hint}
        </p>
      )}
    </div>
  );
}
