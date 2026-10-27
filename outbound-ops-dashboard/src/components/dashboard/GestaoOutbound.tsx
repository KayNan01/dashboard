import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Truck, X } from "lucide-react";
import { useProjectionTotal } from "@/lib/projection";
import { Button } from "@/components/ui/button";
import { seedOutboundState } from "@/lib/data-source";
import {
  DAY_PERIODS,
  PERIODS,
  buildOutboundTable,
  currentPeriodIndex,
  emptyDayState,
  saoPauloParts,
  type DayState,
  type ManualOutboundRow,
  type OutboundRow,
} from "@/lib/outbound-logic";

function todayKey(): string {
  return saoPauloParts().date;
}

function nowMin(): number {
  return saoPauloParts().minutes;
}

function emptyState(): DayState {
  return emptyDayState(todayKey());
}

function loadDayState(): DayState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem("gestaoOutbound:v1");
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<DayState>;
    if (parsed.date !== todayKey()) return emptyState();
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function saveDayState(s: DayState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("gestaoOutbound:v1", JSON.stringify(s));
}

export interface OutboundSnapshot {
  date: string;
  pod: number;
  pendentes: number;
  totalRealizado: number;
  totalExpedido: number;
  produtividadeMedia: number;
  rows: OutboundRow[];
}

export function GestaoOutbound({
  totalPedidos,
  snapshot,
}: {
  totalPedidos: number;
  snapshot?: OutboundSnapshot;
}) {
  const readOnly = !!snapshot;
  const [state, setState] = useState<DayState>(emptyState);
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [projTotal, setProjTotal] = useProjectionTotal();
  const [editing, setEditing] = useState(false);
  const [draftState, setDraftState] = useState<DayState | null>(null);
  const [draftPod, setDraftPod] = useState(projTotal);

  // Demo mode: the day state lives only in this browser (localStorage).
  useEffect(() => {
    if (readOnly) return;
    setMounted(true);
    setState(loadDayState());
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [readOnly]);

  // First visit of the day: seed a realistic state from the mock data so the
  // table shows already-closed periods instead of an empty sheet.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!mounted || readOnly || seededRef.current || totalPedidos <= 0) return;
    seededRef.current = true;
    const saved = loadDayState();
    const hasData =
      Object.values(saved.equipe).some((v) => v > 0) ||
      Object.values(saved.acumuladoFrozen).some((v) => v > 0);
    if (hasData) return;
    const seeded = seedOutboundState(todayKey(), totalPedidos);
    saveDayState(seeded);
    setState(seeded);
  }, [mounted, readOnly, totalPedidos]);

  useEffect(() => {
    if (!mounted || readOnly || editing) return;
    setState((prev) => {
      const next: DayState = {
        ...prev,
        equipe: { ...prev.equipe },
        acumuladoFrozen: { ...prev.acumuladoFrozen },
      };
      if (next.date !== todayKey()) {
        Object.assign(next, emptyState());
      }
      const now = nowMin();
      const idx = currentPeriodIndex(now);

      if (totalPedidos > next.lastTotal) {
        next.lastActivityMin = now;
        next.lastTotal = totalPedidos;
      } else if (totalPedidos < next.lastTotal) {
        next.lastTotal = totalPedidos;
      }

      for (let i = 0; i < PERIODS.length; i++) {
        const lbl = PERIODS[i].label;
        const ended = idx > i || idx === PERIODS.length;
        if (ended && next.acumuladoFrozen[lbl] === undefined) {
          next.acumuladoFrozen[lbl] = totalPedidos;
        }
      }

      saveDayState(next);
      return next;
    });
  }, [totalPedidos, tick, mounted, readOnly, editing]);

  const activeState = editing && draftState ? draftState : state;
  const activePod = editing ? draftPod : projTotal;
  const table = useMemo(
    () =>
      buildOutboundTable(activeState, totalPedidos, activePod, mounted && !readOnly ? nowMin() : -1),
    [activeState, totalPedidos, activePod, mounted, readOnly, tick],
  );

  const rows = snapshot ? snapshot.rows : table.rows;
  const curIdx = snapshot ? -1 : table.curIdx;
  const lastEnd = snapshot ? null : table.lastEnd;
  const produtividadeMedia = snapshot ? snapshot.produtividadeMedia : table.produtividadeMedia;
  const totalExpedido = snapshot ? snapshot.totalExpedido : table.totalExpedido;
  const pendentes = snapshot ? snapshot.pendentes : state.pendentes;
  const pod = snapshot ? snapshot.pod : activePod;

  function beginEditing() {
    const existing = state.manualRows ?? [];
    const manualRows: ManualOutboundRow[] = table.rows.map((row, index) => ({
      label: row.label,
      start: existing[index]?.start ?? PERIODS[index]?.start ?? "00:00",
      end: existing[index]?.end ?? PERIODS[index]?.end ?? "00:00",
      planejado: existing[index]?.planejado ?? null,
      realizado: existing[index]?.realizado ?? null,
      acumulado: existing[index]?.acumulado ?? null,
      equipe: existing[index]?.equipe ?? null,
    }));
    setDraftState({ ...state, manualRows });
    setDraftPod(projTotal);
    setEditing(true);
  }

  function updateRow(index: number, patch: Partial<ManualOutboundRow>) {
    setDraftState((prev) => {
      if (!prev) return prev;
      const manualRows = [...(prev.manualRows ?? [])];
      const current = manualRows[index];
      if (!current) return prev;
      const updated = { ...current, ...patch };
      updated.label = `${updated.start} - ${updated.end}`;
      manualRows[index] = updated;
      return { ...prev, manualRows };
    });
  }

  async function saveEdits() {
    if (!draftState) return;
    const next = { ...draftState, equipe: { ...draftState.equipe } };
    for (const row of next.manualRows ?? []) {
      if (row.equipe != null) next.equipe[row.label] = row.equipe;
    }
    saveDayState(next);
    setState(next);
    setProjTotal(draftPod);
    setEditing(false);
    setDraftState(null);
  }

  const headerDate = snapshot
    ? new Date(`${snapshot.date}T12:00:00`).toLocaleDateString("pt-BR")
    : mounted
      ? new Date().toLocaleDateString("pt-BR")
      : null;

  return (
    <div className="rounded-xl border bg-card/60 text-card-foreground shadow-sm backdrop-blur xl:col-span-2 font-mono">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-t-xl border-b border-brand-green bg-brand-blue px-4 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <Truck className="size-4" />
          <h3 className="truncate font-display text-sm font-semibold tracking-wide">
            Gestão Operacional Outbound · Performance Expedição
          </h3>
          {headerDate && (
            <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {headerDate}
            </span>
          )}
          {readOnly && (
            <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              Histórico
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <label className="flex h-8 items-center gap-1 rounded border border-brand-green bg-background px-2 text-xs font-bold text-foreground">
              <span className="text-muted-foreground">POD</span>
              <input
                aria-label="Editar POD"
                type="number"
                min={0}
                value={draftPod}
                onChange={(event) => setDraftPod(Math.max(0, Number(event.target.value) || 0))}
                className="w-16 bg-transparent text-right tabular-nums outline-none"
              />
            </label>
          ) : (
            <div className="rounded bg-brand-green px-2 py-1 text-xs font-bold text-brand-blue">
              POD {pod.toLocaleString("pt-BR")}
            </div>
          )}
          {!readOnly && (editing ? (
            <>
              <Button size="sm" onClick={() => void saveEdits()} className="h-8">
                <Check /> Salvar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditing(false); setDraftState(null); }}
                className="h-8 border-primary bg-background text-foreground"
              >
                <X /> Cancelar
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={beginEditing} className="h-8">
              <Pencil /> Editar
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="bg-brand-green text-brand-blue">
              <th className="border border-border/60 px-2 py-1.5 text-left font-semibold">HORÁRIO</th>
              <th className="border border-border/60 px-2 py-1.5 text-right font-semibold">PLANEJADO</th>
              <th className="border border-border/60 px-2 py-1.5 text-right font-semibold">REALIZADO</th>
              <th className="border border-border/60 px-2 py-1.5 text-center font-semibold">ACUMULADO</th>
              <th className="border border-border/60 px-2 py-1.5 text-right font-semibold">%</th>
              <th className="border border-border/60 px-2 py-1.5 text-center font-semibold">EQUIPE</th>
              <th className="border border-border/60 px-2 py-1.5 text-right font-semibold">PROD. H/H</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r, i) => {
              const acumCell = r.acumulado;
              const realizadoCell = r.realizado;
              const pct = r.pct;
              const atingida = r.planejado > 0 && acumCell !== null && acumCell >= r.planejado;
              const isCurrent = !readOnly && mounted && curIdx === i && !r.encerrado;
              const draftRow = editing ? draftState?.manualRows?.[i] : undefined;
              const numberField =
                "h-7 w-20 rounded border border-primary/70 bg-background px-1 text-right text-xs font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

              return (
                <Fragment key={r.label}>
                  {i === DAY_PERIODS.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="border border-border/60 bg-brand-blue px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-white"
                      >
                        Gestão Expedição Noturno
                      </td>
                    </tr>
                  )}
                  <tr
                    className={
                      atingida
                        ? "bg-success/10"
                        : isCurrent
                          ? "bg-primary/10"
                          : "bg-background/50"
                    }
                  >
                    <td className="border border-border/60 px-2 py-1 font-semibold">
                      {editing && draftRow ? (
                        <div className="flex items-center gap-1">
                          <input
                            aria-label={`Início do horário ${i + 1}`}
                            type="time"
                            value={draftRow.start}
                            onChange={(event) => updateRow(i, { start: event.target.value })}
                            className="h-7 w-[5.3rem] rounded border border-primary/70 bg-background px-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <span>–</span>
                          <input
                            aria-label={`Fim do horário ${i + 1}`}
                            type="time"
                            value={draftRow.end}
                            onChange={(event) => updateRow(i, { end: event.target.value })}
                            className="h-7 w-[5.3rem] rounded border border-primary/70 bg-background px-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                      ) : r.label}
                      {isCurrent && <span className="ml-1 text-[9px] text-primary">● ativo</span>}
                      {i === rows.length - 1 && lastEnd !== null && (
                        <span className="ml-1 text-[9px] text-muted-foreground">
                          encerrado {String(Math.floor(lastEnd / 60)).padStart(2, "0")}:
                          {String(lastEnd % 60).padStart(2, "0")}
                        </span>
                      )}
                    </td>
                    <td className="border border-border/60 px-2 py-1 text-right tabular-nums">
                      {editing && draftRow ? (
                        <input
                          aria-label={`Planejado ${r.label}`}
                          type="number"
                          min={0}
                          value={draftRow.planejado ?? r.planejado}
                          onChange={(event) => updateRow(i, { planejado: Math.max(0, Number(event.target.value) || 0) })}
                          className={numberField}
                        />
                      ) : r.planejado > 0 ? r.planejado.toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="border border-border/60 px-2 py-1 text-right tabular-nums font-semibold">
                      {editing && draftRow ? (
                        <input
                          aria-label={`Realizado ${r.label}`}
                          type="number"
                          min={0}
                          value={draftRow.realizado ?? ""}
                          onChange={(event) => updateRow(i, { realizado: event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0) })}
                          className={numberField}
                        />
                      ) : realizadoCell !== null ? realizadoCell.toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="border border-border/60 px-2 py-1 text-center">
                      {editing && draftRow ? (
                        <input
                          aria-label={`Acumulado ${r.label}`}
                          type="number"
                          min={0}
                          value={draftRow.acumulado ?? ""}
                          onChange={(event) => updateRow(i, { acumulado: event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0) })}
                          className={numberField}
                        />
                      ) : (
                        <span className="tabular-nums font-semibold">
                          {acumCell !== null ? acumCell.toLocaleString("pt-BR") : "-"}
                        </span>
                      )}
                    </td>
                    <td
                      className={`border border-border/60 px-2 py-1 text-right tabular-nums ${
                        atingida
                          ? "text-success font-bold"
                          : pct > 0 && pct < 100
                            ? "text-destructive font-semibold"
                            : ""
                      }`}
                    >
                      {r.planejado > 0 ? `${(pct - 100).toFixed(1)}%` : "-"}
                    </td>

                    <td className="border border-border/60 px-1 py-0.5 text-center">
                      {editing && draftRow ? (
                        <input
                          aria-label={`Equipe ${r.label}`}
                          type="number"
                          min={0}
                          value={draftRow.equipe ?? r.equipe}
                          onChange={(event) => updateRow(i, { equipe: Math.max(0, Number(event.target.value) || 0) })}
                          className="h-7 w-14 rounded border border-primary/70 bg-background px-1 text-center text-xs font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <span className="tabular-nums font-semibold">{r.equipe}</span>
                      )}
                    </td>
                    <td className="border border-border/60 px-2 py-1 text-right tabular-nums">
                      {Math.round(r.prodHH).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-lg border border-brand-green bg-brand-blue px-3 py-2 text-white">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Pedidos Pendentes</span>
          {editing && draftState ? (
            <input
              aria-label="Editar pedidos pendentes"
              type="number"
              min={0}
              value={draftState.pendentes}
              onChange={(event) => setDraftState((prev) => prev ? { ...prev, pendentes: Math.max(0, Number(event.target.value) || 0) } : prev)}
              className="h-7 w-20 rounded border bg-white/95 px-1 text-right text-sm font-bold tabular-nums text-brand-blue outline-none"
            />
          ) : (
            <span className="rounded bg-white/95 px-2 py-0.5 text-sm font-bold tabular-nums text-brand-blue">
              {pendentes.toLocaleString("pt-BR")}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-brand-green bg-brand-blue px-3 py-2 text-white">
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            Prod. Média (Ped/Hom/h)
          </span>
          <span className="rounded bg-success/20 px-2 py-0.5 text-sm font-bold tabular-nums text-success">
            {Math.round(produtividadeMedia).toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-brand-green bg-brand-blue px-3 py-2 text-white">
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            Total Expedidos
          </span>
          <span className="rounded bg-white/95 px-2 py-0.5 text-sm font-bold tabular-nums text-brand-blue">
            {totalExpedido.toLocaleString("pt-BR")}
          </span>
        </div>
      </div>
    </div>
  );
}
