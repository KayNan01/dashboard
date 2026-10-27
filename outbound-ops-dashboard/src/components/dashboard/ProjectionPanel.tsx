import { useState } from "react";
import { AlertTriangle, Boxes, Package, Truck, Layers, PackageOpen, Scale, Pencil, RotateCcw } from "lucide-react";
import {
  CAMINHAO_SACAS,
  CAIXAS_POR_SACA,
  computeProjection,
  limiteTone,
  useMercadoFullCaixas,
  useProjectionTotal,
  useSacaPedidos,
  useHubPercentuais,
} from "@/lib/projection";
import { CustoPorPeca } from "./CustoPorPeca";

const caminhaoNecessarioLabel = (quantidade: number) =>
  quantidade === 1 ? "caminhão necessário" : "caminhões necessários";

export function ProjectionPanel() {
  const [total, setTotal] = useProjectionTotal();
  const [caixasMF, setCaixasMF] = useMercadoFullCaixas();
  const [sacaPedidos, setSacaPedidos] = useSacaPedidos();
  const [hubPct, setHubPct, resetHubPct] = useHubPercentuais();
  const m = computeProjection(total, caixasMF, sacaPedidos, hubPct);

  const hubList = m.distribuicao.filter((d) => d.grupo === "HUB");

  const cxPorSaca = m.sacasMercadoFull > 0 ? m.caixasMercadoFull / m.sacasMercadoFull : 0;

  return (
    <div className="space-y-3">
      {/* Inputs */}
      <section className="rounded-2xl border bg-card/60 p-4 text-card-foreground shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">
              📦 Projeção Operacional
            </h2>
            <p className="text-xs text-muted-foreground">
              Defina a projeção do dia, as caixas do Marketplace Full e a média de pedidos por saca. O sistema calcula sacas, ocupação e alertas.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Projeção de pedidos
              </span>
              <input
                type="number"
                min={0}
                value={total}
                onChange={(e) => setTotal(Math.max(0, parseInt(e.target.value || "0", 10)))}
                className="h-10 w-36 rounded-lg border border-primary/30 bg-background px-3 text-right font-mono text-lg font-semibold text-foreground shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Caixas Marketplace Full
              </span>
              <input
                type="number"
                min={0}
                value={caixasMF}
                onChange={(e) => setCaixasMF(Math.max(0, parseInt(e.target.value || "0", 10)))}
                className="h-10 w-36 rounded-lg border border-amber-500/40 bg-background px-3 text-right font-mono text-lg font-semibold text-foreground shadow-inner focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Média pedidos / saca
              </span>
              <input
                type="number"
                min={1}
                value={sacaPedidos}
                onChange={(e) => setSacaPedidos(Math.max(1, parseInt(e.target.value || "1", 10)))}
                className="h-10 w-36 rounded-lg border border-success/40 bg-background px-3 text-right font-mono text-lg font-semibold text-foreground shadow-inner focus:border-success focus:outline-none focus:ring-2 focus:ring-success/30"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        <PremiumKpi
          icon={Package}
          label="Projeção total"
          value={m.total.toLocaleString("pt-BR")}
          hint="pedidos do dia"
          tone="primary"
        />
        <PremiumKpi
          icon={Truck}
          label="Pedidos HUB"
          value={m.hubPedidos.toLocaleString("pt-BR")}
          hint={`${((m.hubPedidos / Math.max(1, m.total)) * 100).toFixed(1)}% do total`}
          tone="info"
        />
        <PremiumKpi
          icon={PackageOpen}
          label="Caixas Marketplace Full"
          value={`${m.caixasMercadoFull.toLocaleString("pt-BR")} CX / ${m.sacasMercadoFull} SACAS`}
          hint={
            m.sacasMercadoFull > 0
              ? `${cxPorSaca.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cx / saca`
              : `${CAIXAS_POR_SACA.toFixed(2)} cx / saca (padrão)`
          }
          tone="warning"
        />
        <PremiumKpi
          icon={Layers}
          label="Sacas HUB"
          value={m.sacasHub.toLocaleString("pt-BR")}
          hint={`${sacaPedidos} pedidos / saca`}
          tone="success"
        />
        <PremiumKpi
          icon={Boxes}
          label="Ocupação caminhão"
          value={`${m.ocupacaoPct}%`}
          hint={`${m.sacasTotais} / ${CAMINHAO_SACAS} sacas`}
          tone={m.ocupacaoPct >= 90 ? "danger" : m.ocupacaoPct >= 70 ? "warning" : "success"}
        />
        <PremiumKpi
          icon={Scale}
          label="Diferença limite"
          value={m.diferencaLimite >= 0 ? `${m.diferencaLimite}s restantes` : `${Math.abs(m.diferencaLimite)}s acima`}
          hint={m.diferencaLimite >= 0 ? "dentro da capacidade" : "superlotação!"}
          tone={limiteTone(m.sacasTotais)}
          pulse={m.superlotacao}
        />
        <PremiumKpi
          icon={AlertTriangle}
          label="Status operacional"
          value={m.superlotacao ? "ATENÇÃO" : "OK"}
          hint={
            m.superlotacao
              ? `Superlotação — ${m.caminhoesNecessarios}\u00a0${caminhaoNecessarioLabel(m.caminhoesNecessarios)}`
              : "dentro do limite"
          }
          tone={m.superlotacao ? "danger" : "success"}
          pulse={m.superlotacao}
        />
      </section>

      {/* Alerta visual */}
      {m.superlotacao && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-destructive/60 bg-destructive/10 p-4 text-destructive-foreground shadow-[0_0_40px_-10px_rgba(239,68,68,0.6)]">
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-destructive/5" />
          <div className="relative flex items-center gap-3">
            <AlertTriangle className="size-6 shrink-0 text-destructive animate-pulse" />
            <div>
              <p className="font-display text-sm font-bold text-destructive">
                ⚠ Superlotação próxima — necessidade de 2 caminhões
              </p>
              <p className="text-xs text-destructive/80">
                {m.sacasTotais} sacas totais (HUB {m.sacasHub} + Marketplace Full {m.sacasMercadoFull}) · limite {CAMINHAO_SACAS}/caminhão
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de ocupação */}
      <section className="rounded-2xl border bg-card/60 p-4 text-card-foreground shadow-sm backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">🚛 Ocupação do Caminhão (HUB + Marketplace Full)</h3>
          <span className="font-mono text-xs text-muted-foreground">
            {m.sacasTotais} / {CAMINHAO_SACAS} sacas
          </span>
        </div>
        <div className="relative h-6 w-full overflow-hidden rounded-full border bg-muted/40">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-success to-success/70"
            style={{ width: `${Math.min(100, (m.sacasHub / CAMINHAO_SACAS) * 100)}%` }}
          />
          <div
            className="absolute inset-y-0 bg-gradient-to-r from-amber-500 to-amber-400/70"
            style={{
              left: `${Math.min(100, (m.sacasHub / CAMINHAO_SACAS) * 100)}%`,
              width: `${Math.min(100 - (m.sacasHub / CAMINHAO_SACAS) * 100, (m.sacasMercadoFull / CAMINHAO_SACAS) * 100)}%`,
            }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground mix-blend-difference">
            {m.ocupacaoPct}%
          </span>
        </div>
        <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-success" />HUB · {m.sacasHub}s</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-amber-500" />Marketplace Full · {m.sacasMercadoFull}s</span>
        </div>
      </section>

      {/* Distribuição HUB + Custo por Peça */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <GrupoTable
          title="HUB"
          subtitle={`${m.hubPedidos.toLocaleString("pt-BR")} pedidos · ${m.sacasHub} sacas`}
          items={hubList}
          highlight
          onPctChange={setHubPct}
          onReset={resetHubPct}
        />
        <CustoPorPeca />
      </section>
    </div>
  );
}

function PremiumKpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  pulse,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "info" | "success" | "warning" | "caution" | "danger";
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: "from-primary/20 to-primary/5 text-primary border-primary/30",
    info: "from-sky-500/20 to-sky-500/5 text-sky-400 border-sky-500/30",
    success: "from-success/20 to-success/5 text-success border-success/30",
    warning: "from-warning/20 to-warning/5 text-warning border-warning/30",
    caution: "from-orange-500/20 to-orange-500/5 text-orange-400 border-orange-500/30",
    danger: "from-destructive/25 to-destructive/5 text-destructive border-destructive/40",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-3 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md ${tones[tone]} ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80 break-words whitespace-normal min-w-0">{label}</p>
        <Icon className="size-4 opacity-90 shrink-0" />
      </div>
      <p className="mt-1 font-display text-xl font-bold tracking-tight text-foreground break-words whitespace-normal">
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground break-words whitespace-normal">{hint}</p>}
    </div>
  );
}

function GrupoTable({
  title,
  subtitle,
  items,
  highlight,
  onPctChange,
  onReset,
}: {
  title: string;
  subtitle: string;
  items: { nome: string; pct: number; pedidos: number }[];
  highlight?: boolean;
  onPctChange?: (nome: string, pct: number) => void;
  onReset?: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const max = Math.max(1, ...items.map((i) => i.pedidos));
  const somaPct = items.reduce((s, i) => s + i.pct, 0);
  return (
    <div
      className={`rounded-2xl border bg-card/60 p-4 text-card-foreground shadow-sm backdrop-blur ${
        highlight ? "ring-1 ring-success/40" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {highlight && !editando && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              cálculo de sacas
            </span>
          )}
          {onPctChange && (
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted"
            >
              <Pencil className="size-3" />
              {editando ? "Concluir" : "Editar %"}
            </button>
          )}
          {editando && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted"
            >
              <RotateCcw className="size-3" />
              Padrão
            </button>
          )}
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t.nome} className="grid grid-cols-[1fr_auto] items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium">{t.nome}</span>
                {editando && onPctChange ? (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      value={t.pct}
                      onChange={(e) => onPctChange(t.nome, parseFloat(e.target.value || "0"))}
                      className="h-6 w-16 rounded border bg-background px-1 text-right font-mono text-[11px] focus:border-primary focus:outline-none"
                    />
                    <span className="font-mono text-muted-foreground">%</span>
                  </span>
                ) : (
                  <span className="font-mono text-muted-foreground">
                    {t.pct.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}%
                  </span>
                )}
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className={`h-full rounded-full ${
                    highlight ? "bg-success/80" : "bg-primary/70"
                  }`}
                  style={{ width: `${(t.pedidos / max) * 100}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {t.pedidos.toLocaleString("pt-BR")}
            </span>
          </li>
        ))}
      </ul>
      {editando && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Soma HUB: {somaPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
        </p>
      )}
    </div>
  );
}
