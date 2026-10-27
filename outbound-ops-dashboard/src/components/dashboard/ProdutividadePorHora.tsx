import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Trophy, Users, Timer } from "lucide-react";
import { fetchHourlyHistory, fetchHourlyLive } from "@/lib/data-source";
import { saoPauloParts } from "@/lib/outbound-logic";
import {
  HORAS,
  pivotPh,
  resumoPh,
  type PhRow,
} from "@/lib/produtividade-hora";

type SortKey = "colaborador" | "total" | string;

const fetchLive = (): Promise<PhRow[]> => fetchHourlyLive();
const fetchHistorico = (date: string): Promise<PhRow[]> => fetchHourlyHistory(date);

export function ProdutividadePorHora() {
  const hoje = saoPauloParts().date;
  const [date, setDate] = useState<string>(hoje);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  const isHoje = date === hoje;

  const query = useQuery({
    queryKey: ["produtividade-hora", date, isHoje],
    queryFn: () => (isHoje ? fetchLive() : fetchHistorico(date)),
    refetchInterval: isHoje ? 30_000 : false,
    refetchIntervalInBackground: true,
    placeholderData: (prev) => prev,
  });

  const rows = query.data ?? [];
  const pivot = useMemo(() => pivotPh(rows), [rows]);
  const resumo = useMemo(() => resumoPh(pivot), [pivot]);

  const ordenado = useMemo(() => {
    const arr = [...pivot];
    arr.sort((a, b) => {
      let d: number;
      if (sortKey === "colaborador") d = a.colaborador.localeCompare(b.colaborador);
      else if (sortKey === "total") d = a.total - b.total;
      else d = (a.horas[sortKey] ?? 0) - (b.horas[sortKey] ?? 0);
      return asc ? d : -d;
    });
    return arr;
  }, [pivot, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "colaborador");
    }
  }

  const cards = [
    {
      label: "Total do Dia",
      value: resumo.totalDia.toLocaleString("pt-BR"),
      hint: `${pivot.length} colaboradores`,
      icon: Users,
    },
    {
      label: "Maior Produtividade",
      value: resumo.maiorProdutividade?.colaborador ?? "-",
      hint: resumo.maiorProdutividade
        ? `${resumo.maiorProdutividade.total.toLocaleString("pt-BR")} pedidos`
        : "sem dados",
      icon: Trophy,
    },
    {
      label: "Hora Mais Produtiva",
      value: resumo.horaMaisProdutiva?.hora ?? "-",
      hint: resumo.horaMaisProdutiva
        ? `${resumo.horaMaisProdutiva.total.toLocaleString("pt-BR")} pedidos`
        : "sem dados",
      icon: Clock,
    },
    {
      label: "Média por Colaborador",
      value: Math.round(resumo.mediaPorColaborador).toLocaleString("pt-BR"),
      hint: "pedidos por pessoa",
      icon: Timer,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-green bg-brand-blue px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <Clock className="size-4" />
          <h2 className="font-display text-sm font-semibold tracking-wide">
            Produtividade por H
          </h2>
          {!isHoje && (
            <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              Histórico
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider">Data</label>
          <input
            type="date"
            value={date}
            max={hoje}
            onChange={(e) => setDate(e.target.value || hoje)}
            className="h-7 rounded border bg-white/95 px-2 text-xs font-semibold text-brand-blue outline-none"
          />
          {!isHoje && (
            <button
              type="button"
              onClick={() => setDate(hoje)}
              className="rounded bg-brand-green px-2 py-1 text-[11px] font-bold text-brand-blue"
            >
              Hoje
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, hint, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card/60 p-4 text-card-foreground shadow-sm backdrop-blur">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-2 truncate font-display text-xl font-semibold tracking-tight">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card/60 text-card-foreground shadow-sm backdrop-blur">
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[900px] border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-brand-green text-brand-blue">
                <th
                  onClick={() => toggleSort("colaborador")}
                  className="cursor-pointer border border-border/60 px-2 py-1.5 text-left font-semibold"
                >
                  COLABORADOR
                </th>
                {HORAS.map((h) => (
                  <th
                    key={h}
                    onClick={() => toggleSort(h)}
                    className="cursor-pointer border border-border/60 px-2 py-1.5 text-right font-semibold"
                  >
                    {h}
                  </th>
                ))}
                <th
                  onClick={() => toggleSort("total")}
                  className="cursor-pointer border border-border/60 px-2 py-1.5 text-right font-semibold"
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {ordenado.length === 0 && (
                <tr>
                  <td colSpan={HORAS.length + 2} className="border border-border/60 px-2 py-6 text-center text-muted-foreground">
                    {query.isLoading ? "Carregando..." : "Sem registros para esta data."}
                  </td>
                </tr>
              )}
              {ordenado.map((r) => (
                <tr key={r.colaborador} className="bg-background/50">
                  <td className="border border-border/60 px-2 py-1 font-semibold">{r.colaborador}</td>
                  {HORAS.map((h) => {
                    const v = r.horas[h] ?? 0;
                    return (
                      <td
                        key={h}
                        className={`border border-border/60 px-2 py-1 text-right tabular-nums ${
                          v === 0 ? "text-muted-foreground/60" : ""
                        }`}
                      >
                        {v}
                      </td>
                    );
                  })}
                  <td className="border border-border/60 px-2 py-1 text-right font-bold tabular-nums">
                    {r.total.toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
            {ordenado.length > 0 && (
              <tfoot>
                <tr className="bg-brand-blue text-white">
                  <td className="border border-border/60 px-2 py-1.5 font-semibold uppercase">Total</td>
                  {HORAS.map((h) => (
                    <td key={h} className="border border-border/60 px-2 py-1.5 text-right font-semibold tabular-nums">
                      {resumo.porHora[h] ?? 0}
                    </td>
                  ))}
                  <td className="border border-border/60 px-2 py-1.5 text-right font-bold tabular-nums">
                    {resumo.totalDia.toLocaleString("pt-BR")}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
