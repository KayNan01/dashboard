import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  LayoutDashboard,
  Layers,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Trophy,
  TrendingUp,
  TrendingDown,
  Truck,
  Moon,
  Sun,
  EyeOff,
  Search,
  Scale,
  Users,
  WifiOff,
} from "lucide-react";
import {
  productivityColor,
  productivityTier,
} from "@/lib/dashboard-data";
import {
  computeFastvisionMetrics,
  type FastvisionRow,
} from "@/lib/fastvision";

import { OperationalFilter } from "@/components/dashboard/OperationalFilter";
import { ProjectionPanel } from "@/components/dashboard/ProjectionPanel";
import { PodEquipe } from "@/components/dashboard/PodEquipe";
import { ProdutividadePorHora } from "@/components/dashboard/ProdutividadePorHora";
import { GestaoOutbound, type OutboundSnapshot } from "@/components/dashboard/GestaoOutbound";
import { type OutboundRow, saoPauloParts } from "@/lib/outbound-logic";
import {
  fetchCorrelationState,
  fetchHistoryRange,
  fetchLiveProductivity,
  listHistoryDates,
} from "@/lib/data-source";
import { computeProjection, useProjectionTotal, useMercadoFullCaixas, useSacaPedidos, useHubPercentuais, CAMINHAO_SACAS } from "@/lib/projection";

import { type CorrelationState, type Attribution } from "@/lib/correlation-engine";

import logo from "@/assets/logo.png";

const caminhaoPluralLabel = (quantidade: number) => (quantidade === 1 ? "caminhão" : "caminhões");
const caminhaoNecessarioLabel = (quantidade: number) =>
  quantidade === 1 ? "caminhão necessário" : "caminhões necessários";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outbound Ops Dashboard · Operação EXP" },
      { name: "description", content: "Acompanhamento operacional EXP." },
      { property: "og:title", content: "Outbound Ops Dashboard · Operação EXP" },
      { property: "og:description", content: "Acompanhamento operacional EXP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

interface FastvisionApiResponse {
  rows: FastvisionRow[];
  fetchedAt: string;
}

async function fetchFastvision(): Promise<FastvisionApiResponse> {
  return fetchLiveProductivity();
}

const DONUT_COLORS = [
  "#22C9F2",
  "#C4F04B",
  "#3B6BF0",
  "#00DF5E",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#0EA5E9",
  "#F43F5E",
  "#1C2B57",
];


type Tab = "dashboard" | "projection" | "operational" | "podequipe" | "prodhora";
type TopN = "all" | "5" | "10";

function Dashboard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [light, setLight] = useState<boolean>(false);
  const [themeReady, setThemeReady] = useState(false);
  const [user, setUser] = useState<string>("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [topN, setTopN] = useState<TopN>("all");
  const [histDate, setHistDate] = useState<string>("");
  const [histEnd, setHistEnd] = useState<string>("");

  // Read persisted theme only after mount to avoid SSR/client hydration mismatch
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLight(window.localStorage.getItem("theme") === "light");
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !themeReady) return;
    window.localStorage.setItem("theme", light ? "light" : "dark");
    const root = document.documentElement;
    if (light) root.classList.remove("dark");
    else root.classList.add("dark");
  }, [light, themeReady]);

  // WMS feed – auto-refresh a cada 30s. `placeholderData: keep previous`
  // garante que falhas pontuais não esvaziem o dashboard.
  const query = useQuery({
    queryKey: ["fastvision"],
    queryFn: fetchFastvision,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  // ---- Histórico diário (mock data layer) ----
  const datesQuery = useQuery({
    queryKey: ["historico-datas"],
    queryFn: listHistoryDates,
    staleTime: 60_000,
  });

  // Intervalo selecionado (histEnd vazio = apenas o dia inicial)
  const rangeStart = histDate;
  const rangeEnd = histDate ? (histEnd && histEnd >= histDate ? histEnd : histDate) : "";
  const isRange = !!rangeStart && rangeEnd !== rangeStart;

  const histQuery = useQuery({
    queryKey: ["historico", rangeStart, rangeEnd],
    enabled: !!rangeStart,
    queryFn: async () => {
      const hist = await fetchHistoryRange(rangeStart, rangeEnd);
      const prod = { data: hist.prod as unknown as Record<string, unknown>[] };
      const out = { data: hist.out as unknown as Record<string, unknown>[] };

      // Soma por colaborador em todos os dias do intervalo.
      const acc = new Map<string, { pedidos: number; ativoMin: number; inativoMin: number; hub: number; terc: number }>();
      for (const r of (prod.data ?? []) as Record<string, unknown>[]) {
        const name = String(r.colaborador ?? "");
        if (!name) continue;
        const cur = acc.get(name) ?? { pedidos: 0, ativoMin: 0, inativoMin: 0, hub: 0, terc: 0 };
        cur.pedidos += Number(r.pedidos ?? 0);
        cur.ativoMin += Number(r.ativo_min ?? 0);
        cur.inativoMin += Number(r.inativo_min ?? 0);
        cur.hub += Number(r.hub ?? 0);
        cur.terc += Number(r.terc ?? 0);
        acc.set(name, cur);
      }
      const colabRows: FastvisionRow[] = [...acc.entries()].map(([name, v]) => ({
        name,
        pedidos: v.pedidos,
        ativoMin: v.ativoMin,
        inativoMin: v.inativoMin,
        ativoLabel: `${Math.floor(v.ativoMin / 60)}h ${v.ativoMin % 60}min`,
        inativoLabel: `${Math.floor(v.inativoMin / 60)}h ${v.inativoMin % 60}min`,
      }));
      const attr = [...acc.entries()].map(([name, v]) => ({ name, hub: v.hub, terc: v.terc }));

      const days = (out.data ?? []) as Record<string, unknown>[];
      // Tabela de expedição só faz sentido para um único dia.
      const o = days.length === 1 ? days[0] : null;
      const snapshot: OutboundSnapshot | undefined = o
        ? {
            date: o.date as string,
            pod: Number(o.pod ?? 0),
            pendentes: Number(o.pendentes ?? 0),
            totalRealizado: Number(o.total_realizado ?? 0),
            totalExpedido: Number(o.total_expedido ?? 0),
            produtividadeMedia: Number(o.produtividade_media ?? 0),
            rows: (o.linhas as OutboundRow[]) ?? [],
          }
        : undefined;
      return { colabRows, snapshot, attr, dias: days.length };
    },
  });

  const liveRows: FastvisionRow[] = query.data?.rows ?? [];
  const rows: FastvisionRow[] = histDate ? histQuery.data?.colabRows ?? [] : liveRows;
  const lastUpdate = query.data?.fetchedAt ? new Date(query.data.fetchedAt) : null;
  const hasFreshError = query.isError && !query.data;

  const m = useMemo(
    () => computeFastvisionMetrics(rows, { user, hiddenUsers: hidden }),
    [rows, user, hidden],
  );


  // Correlation engine output (HUB vs third-party split per collaborator).
  // In this public demo it is derived from the mock data layer.
  const corrQuery = useQuery({
    queryKey: ["correlacao", saoPauloParts().date],
    enabled: !histDate,
    queryFn: async (): Promise<CorrelationState | null> => fetchCorrelationState(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  // Histórico: a divisão real por colaborador fica salva em produtividade_diaria.
  const histAttribution = useMemo(() => {
    const map: Record<string, Attribution> = {};
    for (const r of histQuery.data?.attr ?? []) {
      const total = r.hub + r.terc;
      map[r.name] = {
        hub: r.hub,
        terc: r.terc,
        total,
        hubPct: total > 0 ? (r.hub / total) * 100 : 0,
        tercPct: total > 0 ? (r.terc / total) * 100 : 0,
      };
    }
    return map;
  }, [histQuery.data]);

  const attributionMap: Record<string, Attribution> = histDate
    ? histAttribution
    : corrQuery.data?.attribution ?? {};
  const correlationConfidence = histDate ? 1 : corrQuery.data?.confidence ?? 0;
  const lastMatchAt = histDate ? null : corrQuery.data?.lastMatchAt ?? null;


  const colaboradoresSorted = m.colaboradores;
  const limit = topN === "all" ? colaboradoresSorted.length : parseInt(topN, 10);
  const colabPedidosDesc = colaboradoresSorted.slice(0, limit).map((c) => {
    const a = attributionMap[c.name];
    const hub = a ? a.hub : 0;
    const terc = a ? a.terc : 0;
    const attributed = hub + terc;
    // "nd" = pedidos bipados sem sinal de correlação (mostra cinza, sem palpite).
    const nd = Math.max(0, c.pedidos - attributed);
    return { ...c, hub, terc, nd };
  });
  // Média/h separada por grupo: as horas ativas de cada colaborador são
  // rateadas conforme a proporção HUB/TERCEIRIZADAS que ele bipou.
  const mediaGrupos = (() => {
    let hubPedidos = 0, tercPedidos = 0, hubMin = 0, tercMin = 0;
    for (const c of colaboradoresSorted) {
      const a = attributionMap[c.name];
      if (!a) continue;
      const attributed = a.hub + a.terc;
      if (attributed <= 0) continue;
      hubPedidos += a.hub;
      tercPedidos += a.terc;
      hubMin += (c.ativoMin * a.hub) / attributed;
      tercMin += (c.ativoMin * a.terc) / attributed;
    }
    return {
      hubPedidos,
      tercPedidos,
      hub: hubMin > 0 ? hubPedidos / (hubMin / 60) : 0,
      terc: tercMin > 0 ? tercPedidos / (tercMin / 60) : 0,
    };
  })();


  // Participação no total produzido (donut)
  const totalProduzido = colaboradoresSorted.reduce((s, c) => s + c.pedidos, 0);
  const participacao = colaboradoresSorted.map((c) => ({
    name: c.name,
    value: c.pedidos,
    pct: totalProduzido > 0 ? (c.pedidos / totalProduzido) * 100 : 0,
  }));

  function toggleHidden(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const filteredUsers = m.allUsers.filter((u) =>
    u.toLowerCase().includes(search.toLowerCase()),
  );

  const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "projection", label: "Projeção", icon: Truck },
    { id: "operational", label: "Filtro Operacional de Pedidos", icon: SlidersHorizontal },
    { id: "podequipe", label: "POD da Equipe", icon: Users },
    { id: "prodhora", label: "Produtividade por H", icon: Activity },
  ];


  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        {/* Sidebar */}
         <aside className="hidden w-64 shrink-0 flex-col border-r border-brand-blue-foreground/20 bg-brand-blue text-brand-blue-foreground shadow-lg lg:flex">
           <div className="flex items-center gap-2 px-5 py-6">
             <img src={logo} alt="Outbound Ops" className="h-9 w-auto invert" />
           </div>
           <nav className="flex-1 px-3">
             <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-brand-blue-foreground/70">
               Operação
             </p>
             <ul className="space-y-1">
               {NAV.map(({ id, label, icon: Icon }) => {
                 const active = tab === id;
                 return (
                   <li key={id}>
                     <button
                       onClick={() => setTab(id)}
                       className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                         active
                           ? "bg-brand-green text-brand-blue shadow-inner"
                           : "text-brand-blue-foreground hover:bg-brand-blue-foreground/10 hover:text-brand-blue-foreground"
                       }`}
                     >
                       <Icon className="size-4" />
                       <span className="truncate text-left">{label}</span>
                     </button>
                   </li>
                 );
               })}
             </ul>
             {/* Ranking ao vivo logo abaixo de POD da Equipe */}
             <div className="mt-3 rounded-xl border border-brand-blue-foreground/20 bg-brand-blue-foreground/10 p-2.5 shadow-sm">

             <div className="mb-2 flex items-center justify-between">
               <div>
                 <h3 className="font-display text-xs font-semibold">Produtividade</h3>
                 <p className="text-[10px] text-brand-blue-foreground/70">Ranking ao vivo</p>
               </div>
               <span className="rounded-full bg-brand-green px-1.5 py-0.5 text-[9px] font-semibold text-brand-blue">
                 meta {m.meta}/h
               </span>
             </div>
             <ul className="max-h-[calc(100vh-260px)] space-y-1 overflow-y-auto pr-1">
               {colaboradoresSorted.length === 0 && (
                 <li className="rounded-lg border border-dashed border-brand-blue-foreground/30 p-2 text-center text-[10px] text-brand-blue-foreground/70">
                   Aguardando dados do WMS…
                 </li>
               )}
               {colaboradoresSorted.map((c, i) => {
                 const tier = productivityTier(c.produtividade);
                 const tierClass =
                   tier === "success"
                     ? "border-success/40 bg-success/5"
                     : tier === "warning"
                       ? "border-warning/40 bg-warning/5"
                       : "border-destructive/40 bg-destructive/5";
                 const trendIcon =
                   tier === "success" ? (
                     <TrendingUp className="size-3 text-success" />
                   ) : tier === "destructive" ? (
                     <TrendingDown className="size-3 text-destructive" />
                   ) : (
                     <Activity className="size-3 text-warning" />
                   );
                 return (
                   <li
                     key={c.name}
                     className={`group flex items-center gap-2 rounded-lg border ${tierClass} px-2 py-1.5 transition hover:-translate-y-0.5 hover:shadow`}
                   >
                     <span
                       className={`flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                         i === 0 ? "bg-warning text-warning-foreground" : "bg-brand-blue-foreground/15 text-brand-blue-foreground"
                       }`}
                     >
                       {i + 1}
                     </span>
                     <div className="min-w-0 flex-1">
                       <p className="truncate text-[11px] font-semibold leading-tight">{c.name}</p>
                       <p className="text-[9px] text-brand-blue-foreground/70 leading-tight">
                         {c.pedidos} ped · Ativo {c.ativoLabel}
                         {c.inativoMin > 0 && (
                           <span className="text-destructive"> · Inativo {c.inativoLabel}</span>
                         )}
                       </p>
                     </div>
                     {trendIcon}
                     <div
                       className="shrink-0 text-right font-mono text-xs font-bold leading-none"
                       style={{ color: productivityColor(c.produtividade) }}
                     >
                       {Math.trunc(c.produtividade)}
                       <span className="ml-0.5 text-[8px] font-normal text-brand-blue-foreground/70">/h</span>
                     </div>
                   </li>
                 );
               })}
             </ul>
           </div>
           </nav>
           <div className="px-5 py-2 text-[10px] text-brand-blue-foreground/70">
             © Kaynan Lucca · EXP
           </div>

        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <header className={`${tab === "operational" ? "" : "sticky top-0"} z-10 border-b border-brand-blue bg-brand-blue text-brand-blue-foreground shadow-sm`}>
            <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <img src={logo} alt="Outbound Ops" className="h-8 w-auto invert lg:hidden" />
                <div>
                   <h1 className="font-display text-lg font-semibold tracking-tight text-brand-blue-foreground">
                     {NAV.find((n) => n.id === tab)?.label}
                   </h1>
                  <p className="flex items-center gap-2 text-xs text-brand-blue-foreground/80">
                    {lastUpdate ? (
                      <>
                        <span
                          className={`inline-block size-1.5 rounded-full ${
                            query.isError ? "bg-destructive" : "bg-success animate-pulse"
                          }`}
                        />
                        Última atualização: {lastUpdate.toLocaleTimeString("pt-BR")}
                        {query.isError && (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <WifiOff className="size-3" /> Falha na última sincronização
                          </span>
                        )}
                      </>
                    ) : query.isLoading ? (
                      "Carregando dados do WMS…"
                    ) : hasFreshError ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <WifiOff className="size-3" /> Falha ao conectar ao WMS
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => query.refetch()}
                  disabled={query.isFetching}
                  className="inline-flex items-center gap-2 rounded-md border border-brand-blue-foreground/30 bg-brand-blue-foreground/10 px-3 py-2 text-sm font-medium text-brand-blue-foreground transition hover:bg-brand-blue-foreground/20 disabled:opacity-60"
                  title="Atualizar Agora"
                >
                  <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
                  Atualizar
                </button>
                <button
                  onClick={() => setLight((v) => !v)}
                  className="flex size-9 items-center justify-center rounded-md border border-brand-blue-foreground/30 bg-brand-blue-foreground/10 text-brand-blue-foreground transition hover:bg-brand-blue-foreground/20"
                  aria-label="Tema"
                  suppressHydrationWarning
                >
                  <span suppressHydrationWarning>
                    {themeReady && light ? <Moon className="size-4" /> : <Sun className="size-4" />}
                  </span>
                </button>
              </div>
            </div>

            {/* Mobile nav tabs */}
            <div className="flex gap-1 overflow-x-auto border-t border-brand-blue-foreground/20 px-3 py-2 lg:hidden">
              {NAV.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-brand-blue-foreground/80 hover:bg-brand-blue-foreground/10 hover:text-brand-blue-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </header>

          <main className="px-4 py-4 sm:px-6">
            {tab === "operational" ? (
              <OperationalFilter />
            ) : tab === "projection" ? (
              <ProjectionPanel />
            ) : tab === "podequipe" ? (
              <PodEquipe />
            ) : tab === "prodhora" ? (
              <ProdutividadePorHora />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <div className="min-w-0 space-y-3">
                  {/* Filtros - card retrátil */}
                  <section className="overflow-hidden rounded-2xl border bg-card/60 text-card-foreground shadow-sm backdrop-blur">
                    <button
                      type="button"
                      onClick={() => setFiltersOpen((v) => !v)}
                      aria-expanded={filtersOpen}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-accent/30"
                    >
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="size-4 text-primary" />
                        <h3 className="text-sm font-medium">Filtros</h3>
                        {(user !== "all" || hidden.size > 0 || topN !== "all") && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            ativos
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        className={`size-4 text-muted-foreground transition-transform duration-300 ${
                          filtersOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                        filtersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <span>Colaborador</span>
                            <select
                              value={user}
                              onChange={(e) => setUser(e.target.value)}
                              className="h-8 min-w-[170px] rounded-md border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="all">Todos</option>
                              {m.allUsers.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <span>De</span>
                            <select
                              value={histDate}
                              onChange={(e) => {
                                setHistDate(e.target.value);
                                if (!e.target.value) setHistEnd("");
                              }}
                              className="h-8 min-w-[150px] rounded-md border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="">Hoje (ao vivo)</option>
                              {(datesQuery.data ?? [])
                                .filter((d) => d !== saoPauloParts().date)
                                .map((d) => (
                                  <option key={d} value={d}>
                                    {new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR")}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <span>Até</span>
                            <select
                              value={histEnd}
                              disabled={!histDate}
                              onChange={(e) => setHistEnd(e.target.value)}
                              className="h-8 min-w-[150px] rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-50"
                            >
                              <option value="">Mesmo dia</option>
                              {(datesQuery.data ?? [])
                                .filter((d) => d !== saoPauloParts().date && !!histDate && d >= histDate)
                                .map((d) => (
                                  <option key={d} value={d}>
                                    {new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR")}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {isRange && (
                            <span className="pb-1.5 text-xs text-muted-foreground">
                              Somando {histQuery.data?.dias ?? 0} dia(s)
                            </span>
                          )}

                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <span>Top</span>
                            <select
                              value={topN}
                              onChange={(e) => setTopN(e.target.value as TopN)}
                              className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="all">Todos</option>
                              <option value="5">Top 5</option>
                              <option value="10">Top 10</option>
                            </select>
                          </label>
                          <button
                            onClick={() => setShowFilter((v) => !v)}
                            className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-accent transition"
                          >
                            <EyeOff className="size-4" />
                            Ocultar usuários
                            {hidden.size > 0 && (
                              <span className="rounded-full bg-destructive/15 px-1.5 text-xs text-destructive">
                                {hidden.size}
                              </span>
                            )}
                          </button>
                          {(user !== "all" || hidden.size > 0 || topN !== "all") && (
                            <button
                              onClick={() => {
                                setUser("all");
                                setHidden(new Set());
                                setTopN("all");
                              }}
                              className="h-8 rounded-md border bg-background px-3 text-sm hover:bg-accent transition"
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                        {showFilter && (
                          <div className="border-t border-border/60 px-4 py-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-xs font-medium text-muted-foreground">
                                Ocultar usuários dos gráficos
                              </h4>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setHidden(new Set())}
                                  className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent transition"
                                >
                                  Selecionar todos
                                </button>
                                <button
                                  onClick={() => setHidden(new Set(m.allUsers))}
                                  className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent transition"
                                >
                                  Limpar seleção
                                </button>
                              </div>
                            </div>
                            <div className="relative mb-2">
                              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar usuário..."
                                className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-sm text-foreground"
                              />
                            </div>
                            <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                              {filteredUsers.map((u) => {
                                const visible = !hidden.has(u);
                                return (
                                  <label
                                    key={u}
                                    className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent bg-background px-2 py-1 text-xs hover:border-border"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={visible}
                                      onChange={() => toggleHidden(u)}
                                      className="size-3.5 accent-primary"
                                    />
                                    <span className={visible ? "" : "text-muted-foreground line-through"}>
                                      {u}
                                    </span>
                                  </label>
                                );
                              })}
                              {filteredUsers.length === 0 && (
                                <p className="col-span-full text-xs text-muted-foreground">
                                  Nenhum usuário encontrado.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Destaques compactos */}
                  <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <GlassKpi
                      label="Total produzido"
                      value={m.totalPedidos}
                      hint="pedidos bipados"
                      icon={Activity}
                      tone="primary"
                    />
                    <GlassKpi
                      label="Melhor colaborador"
                      value={m.top?.name ?? "—"}
                      hint={`${m.top?.pedidos ?? 0} pedidos`}
                      icon={Trophy}
                      tone="warning"
                      highlight
                    />
                    <GlassKpi
                      label="Média produtividade"
                      value={`${Math.trunc(m.mediaEquipe)}/h`}
                      hint={`meta ${m.meta}/h`}
                      icon={TrendingUp}
                      tone={productivityTier(m.mediaEquipe)}
                      extra={
                        <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-border/60 pt-1.5">
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Sacas
                            </p>
                            <p className="font-mono text-xs font-semibold text-group-hub">
                              {Math.trunc(mediaGrupos.hub)}/h
                            </p>
                            <p className="text-[9px] text-muted-foreground">{mediaGrupos.hubPedidos} ped.</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Terceirizadas
                            </p>
                            <p className="font-mono text-xs font-semibold text-group-terc">
                              {Math.trunc(mediaGrupos.terc)}/h
                            </p>
                            <p className="text-[9px] text-muted-foreground">{mediaGrupos.tercPedidos} ped.</p>
                          </div>
                        </div>
                      }
                    />

                    <GlassKpi
                      label="Abaixo da meta"
                      value={m.abaixoMeta}
                      hint={`meta ${m.meta}/h`}
                      icon={TrendingDown}
                      tone="destructive"
                    />
                  </section>

                  {tab === "dashboard" && (
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {/* 1. Horizontal bars */}
                      <ChartCard
                        title="Colaboradores · Pedidos Bipados"
                        subtitle="Ranking Decrescente"
                      >
                        <ScrollChartV
                          count={colabPedidosDesc.length}
                          rowHeight={22}
                          minHeight={220}
                        >
                          <BarChart
                            data={colabPedidosDesc}
                            layout="vertical"
                            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                            <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} allowDecimals={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              stroke="var(--muted-foreground)"
                              fontSize={10}
                              interval={0}
                              width={Math.min(180, Math.max(80, (colabPedidosDesc.reduce((mx, c) => Math.max(mx, c.name.length), 0)) * 6 + 16))}
                              tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)}
                            />
                            <Tooltip content={<TT attribution={attributionMap} confidence={correlationConfidence} lastMatchAt={lastMatchAt} />} cursor={{ fill: "var(--accent)", opacity: 0.3 }} />
                            <Legend
                              verticalAlign="top"
                              height={24}
                              iconType="square"
                              wrapperStyle={{ fontSize: 11 }}
                            />
                            <Bar
                              dataKey="hub"
                              name="HUB"
                              stackId="p"
                              fill="var(--group-hub)"
                              barSize={18}
                            />
                            <Bar
                              dataKey="terc"
                              name="TERCEIRIZADAS"
                              stackId="p"
                              fill="var(--group-terc)"
                              barSize={18}
                            />
                            <Bar
                              dataKey="nd"
                              name="Sem correlação"
                              stackId="p"
                              fill="#6B7280"
                              radius={[0, 6, 6, 0]}
                              barSize={18}
                            >
                              <LabelList
                                dataKey="pedidos"
                                position="right"
                                fill="var(--foreground)"
                                fontSize={11}
                                fontWeight={600}
                              />
                            </Bar>
                          </BarChart>
                        </ScrollChartV>
                      </ChartCard>

                      {/* 2. Painel de Projeção Operacional */}
                      <DashboardProjectionCard />


                      {/* 3. Gestão Operacional Outbound (só faz sentido por dia) */}
                      {isRange ? (
                        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                          A tabela de Performance Expedição é diária — selecione um único dia para visualizá-la.
                        </div>
                      ) : (
                        <GestaoOutbound
                          totalPedidos={m.totalPedidos}
                          snapshot={histDate ? histQuery.data?.snapshot : undefined}
                        />
                      )}

                    </div>
                  )}

                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ---- Small components ----

function GlassKpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  highlight,
  extra,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof LayoutDashboard;
  tone?: "primary" | "warning" | "success" | "destructive";
  highlight?: boolean;
  extra?: React.ReactNode;
}) {

  const TONES: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/20 text-warning",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-card/60 px-3 py-2.5 text-card-foreground shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md ${
        highlight ? "ring-1 ring-warning/40" : ""
      }`}
    >
      {highlight && (
        <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-warning/20 blur-2xl" />
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <span className={`flex size-6 items-center justify-center rounded-md ${TONES[tone]}`}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p
        className="mt-1.5 break-words whitespace-normal font-display font-semibold tracking-tight"
        style={{ fontSize: "clamp(0.95rem, 2.2vw, 1.4rem)" }}
        title={typeof value === "string" ? value : String(value)}
      >
        {value}
      </p>
      {hint && <p className="mt-0 break-words whitespace-normal text-[10px] text-muted-foreground">{hint}</p>}
      {extra}

    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  span,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card/60 text-card-foreground shadow-sm backdrop-blur transition hover:shadow-md ${
        span ? "xl:col-span-2" : ""
      }`}
    >
      <div className="px-4 pt-3 pb-1.5">
        <h3 className="font-display text-xs font-semibold">{title}</h3>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="px-3 pb-3 sm:px-4">{children}</div>
    </div>
  );
}

function DashboardProjectionCard() {
  const [total] = useProjectionTotal();
  const [caixasMF] = useMercadoFullCaixas();
  const [sacaPedidos] = useSacaPedidos();
  const [hubPctMap] = useHubPercentuais();
  const m = computeProjection(total, caixasMF, sacaPedidos, hubPctMap);
  const statusTone = m.superlotacao
    ? "border-destructive/50 bg-destructive/10"
    : m.ocupacaoPct >= 70
      ? "border-warning/50 bg-warning/10"
      : "border-success/40 bg-success/5";
  const hubPct = Math.min(100, (m.sacasHub / CAMINHAO_SACAS) * 100);
  const mfPct = Math.min(100 - hubPct, (m.sacasMercadoFull / CAMINHAO_SACAS) * 100);
  return (
    <div
      className={`rounded-xl border bg-card/60 p-3 text-card-foreground shadow-sm backdrop-blur transition hover:shadow-md ${
        m.superlotacao ? "ring-1 ring-destructive/40" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xs font-semibold">📦 Projeção Operacional</h3>
          <p className="text-[10px] text-muted-foreground">HUB + Marketplace Full · tempo real</p>
        </div>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {m.total.toLocaleString("pt-BR")} pedidos
        </span>
      </div>
      <div className="mt-2 grid gap-1.5 grid-cols-[repeat(auto-fit,minmax(110px,1fr))]">
        <MiniStat icon={Package} label="Projeção total" value={m.total.toLocaleString("pt-BR")} hint="pedidos" />
        <MiniStat icon={Truck} label="Pedidos HUB" value={m.hubPedidos.toLocaleString("pt-BR")} hint="pedidos" />
        <MiniStat icon={Package} label="Caixas MF" value={m.caixasMercadoFull.toLocaleString("pt-BR")} hint={`${m.sacasMercadoFull} sacas`} />
        <MiniStat icon={Layers} label="Sacas HUB" value={String(m.sacasHub)} hint="ped/saca" />
        <MiniStat
          icon={Truck}
          label="Ocupação"
          value={`${m.ocupacaoPct}%`}
          hint={`${m.sacasTotais}/${CAMINHAO_SACAS}s`}
          danger={m.superlotacao}
        />
        <MiniStat
          icon={Scale}
          label="Diferença limite"
          value={m.diferencaLimite >= 0 ? `${m.diferencaLimite}s` : `+${Math.abs(m.diferencaLimite)}s`}
          hint={m.diferencaLimite >= 0 ? "restantes" : "acima do limite"}
          danger={m.diferencaLimite < 0}
        />
        <MiniStat
          icon={AlertTriangle}
          label="Status"
          value={m.superlotacao ? "ATENÇÃO" : "OK"}
          hint={m.superlotacao ? `${m.caminhoesNecessarios} ${caminhaoPluralLabel(m.caminhoesNecessarios)}` : "dentro do limite"}
          danger={m.superlotacao}
        />
      </div>
      <div className="mt-2">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/40">
          <div
            className={`absolute inset-y-0 left-0 rounded-l-full transition-all duration-500 ${
              m.ocupacaoPct >= 90 ? "bg-destructive" : m.ocupacaoPct >= 70 ? "bg-warning" : "bg-success"
            }`}
            style={{ width: `${hubPct}%` }}
          />
          <div
            className="absolute inset-y-0 bg-amber-500 transition-all duration-500"
            style={{ left: `${hubPct}%`, width: `${mfPct}%` }}
          />
        </div>
      </div>
      <div className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${statusTone}`}>
        {m.superlotacao ? (
          <span className="flex items-center gap-1 font-semibold text-destructive">
            <AlertTriangle className="size-3.5 animate-pulse" />
            Superlotação — {m.caminhoesNecessarios}&nbsp;{caminhaoNecessarioLabel(m.caminhoesNecessarios)}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {m.diferencaLimite} sacas restantes para o limite do caminhão
          </span>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  hint,
  danger,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-background/50 p-2 ${
        danger ? "border-destructive/40" : "border-border/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className={`size-3 ${danger ? "text-destructive" : "text-muted-foreground"}`} />
      </div>
      <p className={`font-display text-base font-bold tabular-nums ${danger ? "text-destructive" : ""}`}>
        {value}
      </p>
      {hint && <p className="text-[9px] text-muted-foreground">{hint}</p>}
    </div>
  );
}


function ScrollChartH({
  count,
  height,
  children,
}: {
  count: number;
  height: number;
  children: React.ReactElement;
}) {
  const MIN_PER_BAR = 56;
  const needsScroll = count > 12;
  if (!needsScroll) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    );
  }
  return (
    <div className="w-full overflow-x-auto">
      <div style={{ width: Math.max(600, count * MIN_PER_BAR), height }}>
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ScrollChartV({
  count,
  rowHeight,
  minHeight,
  children,
}: {
  count: number;
  rowHeight: number;
  minHeight: number;
  children: React.ReactElement;
}) {
  const height = Math.max(minHeight, count * rowHeight + 40);
  const needsScroll = height > 520;
  if (!needsScroll) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    );
  }
  return (
    <div className="w-full overflow-y-auto" style={{ maxHeight: 520 }}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TT({ active, payload, label, attribution, confidence, lastMatchAt }: any) {
  if (!active || !payload?.length) return null;
  const attr: Attribution | undefined = attribution && label ? attribution[label] : undefined;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">
            {typeof p.value === "number" ? Math.trunc(p.value) : p.value}
          </span>
        </div>
      ))}
      {(() => {
        const d = payload[0]?.payload ?? {};
        const nd = Number(d.nd ?? 0);
        if (!attr || (attr.total <= 0 && nd <= 0)) return null;
        const totalPed = Number(d.pedidos ?? attr.total + nd);
        const pct = (v: number) => (totalPed > 0 ? Math.round((v / totalPed) * 100) : 0);
        return (
          <div className="mt-2 space-y-0.5 border-t pt-1.5">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-group-hub" />
              <span className="text-muted-foreground">HUB:</span>
              <span className="font-medium">{attr.hub} ({pct(attr.hub)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-group-terc" />
              <span className="text-muted-foreground">TERCEIRIZADAS:</span>
              <span className="font-medium">{attr.terc} ({pct(attr.terc)}%)</span>
            </div>
            {nd > 0 && (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">Não identificado:</span>
                <span className="font-medium">{nd} ({pct(nd)}%)</span>
              </div>
            )}
            {typeof confidence === "number" && (
              <div className="pt-0.5 text-[10px] text-muted-foreground">
                Leitura confirmada: {Math.round(confidence * 100)}%
                {lastMatchAt
                  ? ` · último casamento ${new Date(lastMatchAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}

function ProdTT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow">
      {label && <div className="mb-1 font-medium">{label}</div>}
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ background: payload[0].color ?? payload[0].fill }}
        />
        <span className="text-muted-foreground">pedidos/h:</span>
        <span className="font-medium">{Math.trunc(payload[0].value ?? 0)}</span>
      </div>
      <div className="mt-1 text-muted-foreground">
        Tempo ativo:{" "}
        <span className="font-mono text-foreground">{d.horasLabel ?? "—"}</span>
        {typeof d.minutos === "number" && (
          <span className="ml-1 opacity-70">({d.minutos} min)</span>
        )}
      </div>
    </div>
  );
}

function MinutosTT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow">
      {label && <div className="mb-1 font-medium">{label}</div>}
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ background: payload[0].color ?? payload[0].fill }}
        />
        <span className="text-muted-foreground">Minutos ativos:</span>
        <span className="font-medium">{Math.trunc(payload[0].value ?? 0)}</span>
      </div>
      <div className="mt-1 text-muted-foreground">
        Equivalente: <span className="font-mono text-foreground">{d.horasLabel ?? "—"}</span>
      </div>
    </div>
  );
}

function PctTT({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const total = d.payload?.value ?? 0;
  const pct = d.payload?.pct ?? 0;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow">
      <div className="mb-1 font-medium">{d.name}</div>
      <div className="text-muted-foreground">
        Pedidos: <span className="font-medium text-foreground">{total}</span>
      </div>
      <div className="text-muted-foreground">
        Participação:{" "}
        <span className="font-mono text-foreground">{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}
