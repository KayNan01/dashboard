import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Search,
  Package,
  CheckCircle2,
  ShoppingBag,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import {
  computeFvOpMetrics,
  type FvOpAggr,
  type FvOpRow,
} from "@/lib/fastvision-operacional";
import { fetchOperational } from "@/lib/data-source";

interface FvOpResponse {
  rows: FvOpRow[];
  fetchedAt: string;
  fallback?: boolean;
  error?: string;
}

async function fetchFvOp(): Promise<FvOpResponse> {
  return fetchOperational();
}

const SACA_PEDIDOS = 40;

export function OperationalFilter() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | "HUB" | "TERCEIRIZADAS">("all");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["fastvision-operacional"],
    queryFn: fetchFvOp,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const metrics = useMemo(
    () => (data?.rows ? computeFvOpMetrics(data.rows) : null),
    [data],
  );

  const filteredRows = useMemo(() => {
    if (!metrics) return [];
    return metrics.porTransportadora.filter((r) => {
      if (groupFilter !== "all" && r.grupo !== groupFilter) return false;
      if (search && !r.display.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [metrics, groupFilter, search]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const groupKeys = (grupo: string) =>
    filteredRows.filter((r) => r.grupo === grupo).map((r) => `${r.grupo}-${r.display}`);

  const groupFullyOpen = (grupo: string) => {
    const keys = groupKeys(grupo);
    return keys.length > 0 && keys.every((k) => expanded.has(k));
  };

  const toggleGroup = (grupo: string) => {
    const keys = groupKeys(grupo);
    const allOpen = keys.every((k) => expanded.has(k));
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const k of keys) (allOpen ? next.delete(k) : next.add(k));
      return next;
    });
  };


  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground shadow">
        Carregando dados do WMS...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4" /> Falha ao carregar WMS.
        </div>
        <button
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-1.5 text-xs hover:bg-destructive/20"
        >
          <RefreshCw className="size-3.5" /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-4">
      {data.fallback && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="size-3.5" />
          Não foi possível atualizar o WMS agora ({data.error}). Exibindo última leitura.
        </div>
      )}

      {/* Cabeçalho com data e refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          Fonte: <span className="font-medium text-foreground">WMS</span>
          {metrics.dado && <> · Data {metrics.dado}</>}
          {data.fetchedAt && <> · Atualizado {new Date(data.fetchedAt).toLocaleTimeString("pt-BR")}</>}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Sacas HUB - destaque */}
      <div className="group w-full overflow-hidden rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <ShoppingBag className="size-6" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cálculo de Sacas HUB
              </div>
              <div className="font-display text-3xl font-bold tracking-tight">
                {metrics.sacasHub.sacas}{" "}
                <span className="text-base font-medium text-muted-foreground">sacas</span>
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <div>
              <span className="font-mono font-medium text-foreground">
                {metrics.sacasHub.pedidos}
              </span>{" "}
              pedidos considerados
            </div>
            <div>HUB · TOTAL NORMAL (todas as etapas)</div>
            <div>
              ÷ média de <span className="font-mono">{metrics.sacasHub.media}</span>{" "}
              pedidos/saca · arredondado p/ cima
            </div>
          </div>
        </div>
      </div>

      <hr className="border-border/60" />

      {/* KPIs principais */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total Geral" value={metrics.totals.total} icon={Package} tone="primary" />
        <Kpi label="Ag. Separação" value={metrics.totals.agSeparacao} icon={Package} tone="warning" />
        <Kpi
          label="Separação Concluída"
          value={metrics.totals.separacaoConcluida}
          icon={CheckCircle2}
          tone="primary"
        />
        <Kpi label="Faturado" value={metrics.totals.faturado} icon={CheckCircle2} tone="success" />
      </section>

      <hr className="border-border/60" />

      {/* Tabela analítica */}
      <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow">
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Pedidos por Transportadora · Contagem Direta do WMS
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as typeof groupFilter)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
              >
                <option value="all">Todos os grupos</option>
                <option value="HUB">HUB</option>
                <option value="TERCEIRIZADAS">TERCEIRIZADAS</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar transportadora..."
                  className="h-8 w-56 rounded-md border bg-background pl-7 pr-2 text-xs text-foreground"
                />
              </div>
            </div>
          </div>
          <Legend />
        </div>
        <div className="w-full overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-1 text-base">
            <thead className="text-left text-sm uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="sticky top-0 z-30 rounded-tl-2xl bg-card py-3 text-center border-b-2 border-b-black border-t border-t-black border-l border-l-black border-r border-r-black">Transportadora</th>
                <th className="sticky top-0 z-30 bg-card py-3 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Grupo</th>
                <th className="sticky top-0 z-30 bg-card py-3 pr-4 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Ag. Onda</th>
                <th className="sticky top-0 z-30 bg-card py-3 pr-4 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Ag. Sep.</th>
                <th className="sticky top-0 z-30 bg-card py-3 pr-4 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Sep. Concl.</th>
                <th className="sticky top-0 z-30 bg-card py-3 pr-4 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Faturado</th>
                <th className="sticky top-0 z-30 bg-card py-3 pr-4 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Fat. C/Carga</th>
                <th className="sticky top-0 z-30 bg-card py-3 pr-4 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Fat. S/Carga</th>
                <th className="sticky top-0 z-30 bg-card py-3 pr-4 text-center border-t border-t-black border-b-2 border-b-black border-r border-r-black">Total</th>
                <th className="sticky top-0 z-30 rounded-tr-2xl bg-card py-3 pr-4 text-center border-b-2 border-b-black border-t border-t-black border-r border-r-black">Sacas HUB</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const key = `${r.grupo}-${r.display}`;
                return (
                  <DataRow
                    key={key}
                    r={r}
                    open={expanded.has(key)}
                    groupOpen={groupFullyOpen(r.grupo)}
                    onToggle={() => toggleRow(key)}
                    onToggleGroup={() => toggleGroup(r.grupo)}
                  />
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-base text-muted-foreground">
                    Nenhum resultado.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="text-sm font-semibold">
              <SubtotalRow label="Subtotal HUB" r={metrics.hubTotals} accent="primary" />
              <SubtotalRow
                label="Subtotal TERCEIRIZADAS"
                r={metrics.terceirizadasTotals}
                accent="warning"
              />
              <SubtotalRow label="TOTAL GERAL" r={metrics.totals} accent="total" />
            </tfoot>
          </table>
        </div>
        <div className="mt-4">
          <Legend />
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground w-fit">
      <span className="font-semibold text-foreground">Legenda:</span>
      <span className="inline-flex items-center gap-1" title="Normal">
        <span className="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-bold text-primary">N</span> Normal
      </span>
      <span className="inline-flex items-center gap-1" title="Personalização">
        <span className="rounded bg-warning/20 px-1 py-0.5 text-[10px] font-bold text-warning">P</span> Personalização
      </span>
      <span className="inline-flex items-center gap-1" title="Colmeia">
        <span className="rounded bg-colmeia/20 px-1 py-0.5 text-[10px] font-bold text-colmeia">C</span> Colmeia
      </span>
      <span className="inline-flex items-center gap-1" title="Express">
        <span className="rounded bg-express/20 px-1 py-0.5 text-[10px] font-bold text-express">E</span> Express
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: any;
  tone: "primary" | "warning" | "success";
}) {
  const TONES = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/20 text-warning",
    success: "bg-success/15 text-success",
  } as const;
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <span className={`flex size-8 items-center justify-center rounded-md ${TONES[tone]}`}>
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-3 truncate font-display text-2xl font-semibold tracking-tight">{value}</p>
      </div>
    </div>
  );
}

// Identidade visual por transportadora (apenas apresentação).
// bg vai nos <td> (permite cantos arredondados por linha); tr fica com seletores [&>td].
type CarrierStyle = { bg: string; tr?: string; accent?: string; accentEnd?: string; dark: boolean };

const CARRIER_STYLES: { match: string[]; style: CarrierStyle }[] = [
  { match: ["swiftlane"], style: { bg: "bg-orange-400", accent: "border-l-4 border-orange-700", dark: false } },
  { match: ["northline", "nlx"], style: { bg: "bg-neutral-50", accent: "border-l-4 border-neutral-300", dark: false } },
  { match: ["orbita", "orbita"], style: { bg: "bg-yellow-200", accent: "border-l-4 border-yellow-500", dark: false } },
  { match: ["veloce"], style: { bg: "bg-emerald-300", accent: "border-l-4 border-emerald-600", dark: false } },
  { match: ["corelog", "crx"], style: { bg: "bg-blue-600", accent: "border-l-4 border-blue-900", dark: true } },
  { match: ["marketplace"], style: { bg: "bg-yellow-300", accent: "border-l-4 border-blue-700", accentEnd: "border-r-4 border-blue-700", dark: false } },
  { match: ["rapidlog"], style: { bg: "bg-white", tr: "[&>td]:border-b [&>td]:border-red-200", accent: "border-l-4 border-red-600", dark: false } },
  { match: ["titan"], style: { bg: "bg-neutral-900", tr: "[&>td]:border-r [&>td]:border-white/15", accent: "border-l-4 border-neutral-500", dark: true } },
  { match: ["metro entregas", "metroentregas", "metro "], style: { bg: "bg-[#0b1533]", tr: "[&>td]:border-b [&>td]:border-lime-400/30", accent: "border-l-4 border-lime-400", dark: true } },
  { match: ["bazaar"], style: { bg: "bg-orange-500", tr: "[&>td]:border-r [&>td]:border-white/30", accent: "border-l-4 border-white", dark: true } },
];

function carrierStyle(display: string): CarrierStyle | null {
  const n = display
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const c of CARRIER_STYLES) if (c.match.some((m) => n.includes(m))) return c.style;
  return null;
}

function Breakdown({
  n,
  p,
  c,
  e,
  themed,
}: {
  n: number;
  p: number;
  c: number;
  e: number;
  themed?: CarrierStyle | null;
}) {
  if (!n && !p && !c && !e)
    return (
      <div className={`text-xs leading-tight ${themed ? "opacity-60" : "text-muted-foreground/70"}`}>
        —
      </div>
    );

  const items = [
    { key: "N", label: "Normal", value: n, tone: "bg-primary/15 text-primary" },
    { key: "P", label: "Personalização", value: p, tone: "bg-warning/20 text-warning" },
    { key: "C", label: "Colmeia", value: c, tone: "bg-colmeia/20 text-colmeia" },
    { key: "E", label: "Express", value: e, tone: "bg-express/20 text-express" },
  ].filter((i) => i.value > 0);

  const themedTone = themed?.dark ? "bg-white/20 text-white" : "bg-black/10 text-neutral-900";

  return (
    <div className="mt-1 flex flex-wrap justify-center gap-1 leading-none">
      {items.map((item) => (
        <span
          key={item.key}
          title={item.label}
          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            themed ? themedTone : item.tone
          }`}
        >
          {item.key}
          <span className={`font-mono ${themed ? "" : "text-foreground/80"}`}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

function DataRow({
  r,
  open,
  groupOpen,
  onToggle,
  onToggleGroup,
}: {
  r: FvOpAggr;
  open: boolean;
  groupOpen: boolean;
  onToggle: () => void;
  onToggleGroup: () => void;
}) {
  const st = carrierStyle(r.display);
  const text = st ? (st.dark ? "text-white" : "text-neutral-900") : "";
  return (
    <>
      <tr
        onClick={onToggle}
        className={`group cursor-pointer transition-colors ${st?.tr ?? ""} ${text}`}
      >
        <td className={`py-3 pl-2 pr-4 text-center font-semibold align-top rounded-l-xl border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"} ${st?.accent ?? ""}`}>
          <span className="inline-flex items-center gap-1.5">
            <ChevronRight
              className={`size-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            />
            {r.display}
          </span>
        </td>
        <td className={`py-3 pr-4 text-center align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleGroup();
            }}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold uppercase tracking-wide transition-transform hover:brightness-110 active:scale-95 ${
              r.grupo === "HUB"
                ? "bg-[#192c53] text-white border border-[#00df5e]"
                : "bg-[#00df5e] text-[#192c53] border border-[#192c53]"
            }`}
            title="Expandir/recolher todo o grupo"
          >
            <ChevronRight
              className={`size-3.5 transition-transform duration-200 ${groupOpen ? "rotate-90" : ""}`}
            />
            {r.grupo}
          </button>
        </td>

        <td className={`py-3 pr-4 text-center font-mono align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>{r.agOnda}</td>
        <td className={`py-3 pr-4 text-center font-mono align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>{r.agSeparacao}</td>
        <td className={`py-3 pr-4 text-center font-mono align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>{r.separacaoConcluida}</td>
        <td className={`py-3 pr-4 text-center font-mono align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>{r.faturado}</td>
        <td className={`py-3 pr-4 text-center font-mono align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>{r.faturadoCCarga}</td>
        <td className={`py-3 pr-4 text-center font-mono align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>{r.faturadoSCarga}</td>
        <td className={`py-3 pr-4 text-center font-mono font-semibold align-top border-r border-b border-r-black border-b-black ${st ? st.bg : "group-hover:bg-muted/40"}`}>{r.total}</td>
        <td className={`py-3 pr-4 text-center font-mono align-top rounded-r-xl border-b border-b-black ${st ? st.bg : "group-hover:bg-muted/40"} ${st?.accentEnd ?? ""}`}>
          {r.grupo === "HUB" ? (
            <span
              className={`font-semibold ${st ? "" : "text-primary"}`}
              title={`${r.sacasHubPedidos} pedidos ÷ ${SACA_PEDIDOS}`}
            >
              {r.sacasHub}
            </span>
          ) : (
            <span className={st ? "opacity-60" : "text-muted-foreground"}>—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-black">
          <td colSpan={10} className="p-0 rounded-b-xl bg-muted/30 border-b border-b-black">
            <div className="animate-in fade-in slide-in-from-top-1 duration-200 px-3 py-3 sm:px-6">
              <RowDetails r={r} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Detalhes por tipo de pedido — usa exclusivamente os agregados já calculados.
function RowDetails({ r }: { r: FvOpAggr }) {
  const etapas = [
    { label: "Ag. Onda", n: r.agOndaNormal, p: r.agOndaPerso, c: r.agOndaColmeia, e: r.agOndaExpress, total: r.agOnda },
    { label: "Ag. Separação", n: r.agSepNormal, p: r.agSepPerso, c: r.agSepColmeia, e: r.agSepExpress, total: r.agSeparacao },
    { label: "Separação Concluída", n: r.sepNormal, p: r.sepPerso, c: r.sepColmeia, e: r.sepExpress, total: r.separacaoConcluida },
    { label: "Faturado C/Carga", n: r.fatCNormal, p: r.fatCPerso, c: r.fatCColmeia, e: r.fatCExpress, total: r.faturadoCCarga },
    { label: "Faturado S/Carga", n: r.fatSNormal, p: r.fatSPerso, c: r.fatSColmeia, e: r.fatSExpress, total: r.faturadoSCarga },
    { label: "Faturado (total)", n: r.fatNormal, p: r.fatPerso, c: r.fatColmeia, e: r.fatExpress, total: r.faturado },
  ];

  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm sm:p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Detalhes · {r.display} · {r.grupo}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-bold">Etapa</th>
              <th className="px-3 py-2 text-center font-bold">Normal</th>
              <th className="px-3 py-2 text-center font-bold border-r-2 border-black">Personalização</th>
              <th className="px-3 py-2 text-center font-bold">Colmeia</th>
              <th className="px-3 py-2 text-center font-bold">Express</th>
              <th className="px-3 py-2 text-center font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {etapas.map((et, i) => {
              const zebra = i % 2 === 0 ? "bg-background/50" : "bg-muted/60";
              return (
                <tr key={et.label} className={`${zebra} border-x border-b border-border`}>
                  <td className={`px-3 py-2 font-medium ${i === 0 ? "border-t border-border" : ""}`}>{et.label}</td>
                  <td className={`px-3 py-2 text-center font-mono ${i === 0 ? "border-t border-border" : ""}`}>{et.n || "—"}</td>
                  <td className={`px-3 py-2 text-center font-mono border-r-2 border-black ${i === 0 ? "border-t border-border" : ""}`}>{et.p || "—"}</td>
                  <td className={`px-3 py-2 text-center font-mono ${i === 0 ? "border-t border-border" : ""}`}>{et.c || "—"}</td>
                  <td className={`px-3 py-2 text-center font-mono ${i === 0 ? "border-t border-border" : ""}`}>{et.e || "—"}</td>
                  <td className={`px-3 py-2 text-center font-mono font-semibold ${i === 0 ? "border-t border-border" : ""}`}>{et.total || "—"}</td>
                </tr>
              );
            })}
            <tr className="border-x border-t-2 border-b-2 border-black bg-muted/40 font-semibold">
              <td className="px-3 py-2">Total geral</td>
              <td className="px-3 py-2 text-center font-mono">{r.normal || "—"}</td>
              <td className="px-3 py-2 text-center font-mono border-r-2 border-black">{r.personalizacao || "—"}</td>
              <td className="px-3 py-2 text-center font-mono">{r.colmeia || "—"}</td>
              <td className="px-3 py-2 text-center font-mono">{r.express || "—"}</td>
              <td className="px-3 py-2 text-center font-mono">{r.total || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {r.grupo === "HUB" && (
        <div className="mt-2 text-xs text-muted-foreground">
          Sacas HUB: <span className="font-mono font-semibold text-foreground">{r.sacasHub}</span> ·{" "}
          {r.sacasHubPedidos} pedidos ÷ {SACA_PEDIDOS}
        </div>
      )}
    </div>
  );
}

function SubtotalRow({
  label,
  r,
  accent,
}: {
  label: string;
  r: FvOpAggr;
  accent: "primary" | "warning" | "total";
}) {
  const cls =
    accent === "primary"
      ? "bg-[#192c53]/10"
      : accent === "warning"
      ? "bg-[#00df5e]/10"
      : "bg-muted/40";
  const edge = accent === "total" ? "border-t-2 border-b-2 border-t-black border-b-black" : "border-b-2 border-b-black";
  return (
    <tr>
      <td className={`py-3 pr-4 text-center align-top font-bold rounded-l-xl border-r ${cls} ${edge} border-r-black`}>{label}</td>
      <td className={`py-3 pr-4 text-center align-top border-r ${cls} ${edge} border-r-black`}>—</td>
      <td className={`py-3 pr-4 text-center font-mono align-top border-r ${cls} ${edge} border-r-black`}>
        <div>{r.agOnda}</div>
        <Breakdown n={r.agOndaNormal} p={r.agOndaPerso} c={r.agOndaColmeia} e={r.agOndaExpress} />
      </td>
      <td className={`py-3 pr-4 text-center font-mono align-top border-r ${cls} ${edge} border-r-black`}>
        <div>{r.agSeparacao}</div>
        <Breakdown n={r.agSepNormal} p={r.agSepPerso} c={r.agSepColmeia} e={r.agSepExpress} />
      </td>
      <td className={`py-3 pr-4 text-center font-mono align-top border-r ${cls} ${edge} border-r-black`}>
        <div>{r.separacaoConcluida}</div>
        <Breakdown n={r.sepNormal} p={r.sepPerso} c={r.sepColmeia} e={r.sepExpress} />
      </td>
      <td className={`py-3 pr-4 text-center font-mono align-top border-r ${cls} ${edge} border-r-black`}>
        <div>{r.faturado}</div>
        <Breakdown n={r.fatNormal} p={r.fatPerso} c={r.fatColmeia} e={r.fatExpress} />
      </td>
      <td className={`py-3 pr-4 text-center font-mono align-top border-r ${cls} ${edge} border-r-black`}>
        <div>{r.faturadoCCarga}</div>
        <Breakdown n={r.fatCNormal} p={r.fatCPerso} c={r.fatCColmeia} e={r.fatCExpress} />
      </td>
      <td className={`py-3 pr-4 text-center font-mono align-top border-r ${cls} ${edge} border-r-black`}>
        <div>{r.faturadoSCarga}</div>
        <Breakdown n={r.fatSNormal} p={r.fatSPerso} c={r.fatSColmeia} e={r.fatSExpress} />
      </td>
      <td className={`py-3 pr-4 text-center font-mono font-semibold align-top border-r ${cls} ${edge} border-r-black`}>
        <div>{r.total}</div>
        <Breakdown n={r.normal} p={r.personalizacao} c={r.colmeia} e={r.express} />
      </td>
      <td className={`py-3 pr-4 text-center font-mono align-top rounded-r-xl ${cls} ${edge}`}>
        {r.sacasHub > 0 ? (
          <span className="font-semibold text-primary">{r.sacasHub}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}
