import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  Crown,
  Eraser,
  HeartHandshake,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  Truck,
  Users,
  UtensilsCrossed,
  X,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* ────────── Persistência local ────────── */
const LS = {
  colabs: "podequipe.collaborators.v1",
  trans: "podequipe.transportadoras.v2",
  pres: "podequipe.present.v1",
  scale: "podequipe.scale.v1",
} as const;

const LEADERS = ["ALEX", "BIANCA"] as const;
const LEADER_ROLE: Record<string, string> = {
  ALEX: "Encarregado",
  BIANCA: "Supervisor",
};
const SUPPORT_ROLES = [
  "Conferência de Cargas",
  "Mapeamento de Cargas",
  "Organização do Setor",
  "Suporte Operacional",
] as const;

const DEFAULT_COLABS: string[] = [
  "ALEX",
  "BIANCA",
  "CARLOS",
  "DAVI",
  "ELISA",
  "FABIO",
  "GIOVANA",
  "HUGO",
  "ISABEL",
  "JONAS",
  "KARINA",
  "LEO",
  "MARINA",
  "NICOLAS",
  "OTAVIO",
  "PAULA",
];

const DEFAULT_TRANS: string[] = [
  "Marketplace",
  "Rapidlog",
  "Bazaar",
  "Swiftlane",
  "Northline",
  "Corelog",
  "Veloce",
  "Metro Entregas / Social Shop",
  "Retira Loja",
  "Orbita",
  "Titan",
];

type Scale = {
  support: Record<string, string | null>; // role -> colab
  transport: Record<string, string | null>; // transp -> colab
  lunch1: string[];
  lunch2: string[];
};

const EMPTY_SCALE: Scale = {
  support: {},
  transport: {},
  lunch1: [],
  lunch2: [],
};

function useLS<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setV(JSON.parse(raw) as T);
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v, hydrated]);
  return [v, setV];
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ────────── Componente ────────── */
export function PodEquipe() {
  const [colabs, setColabs] = useLS<string[]>(LS.colabs, DEFAULT_COLABS);
  const [trans, setTrans] = useLS<string[]>(LS.trans, DEFAULT_TRANS);
  const [present, setPresent] = useLS<string[]>(LS.pres, DEFAULT_COLABS);
  const [scale, setScale] = useLS<Scale>(LS.scale, EMPTY_SCALE);

  const [presentOpen, setPresentOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [editColabs, setEditColabs] = useState(false);
  const [editTrans, setEditTrans] = useState(false);
  const [editLunch, setEditLunch] = useState(false);


  const now = useClock();

  const presentSet = useMemo(() => new Set(present), [present]);
  const presentNonLeaders = useMemo(
    () => present.filter((c) => !LEADERS.includes(c as any)),
    [present],
  );

  const filteredColabs = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return colabs;
    return colabs.filter((c) => c.toLowerCase().includes(s));
  }, [colabs, search]);

  function togglePresent(name: string) {
    setPresent((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }

  function generateScale() {
    const pool = [...presentNonLeaders];
    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const support: Record<string, string | null> = {};
    for (const role of SUPPORT_ROLES) support[role] = pool.shift() ?? null;

    // Transportadoras: se faltar colaborador, repete nomes para preencher todas
    const transport: Record<string, string | null> = {};
    const transportNames: (string | null)[] = [];
    for (let i = 0; i < trans.length; i++) {
      if (pool.length > 0) {
        transportNames.push(pool.shift()!);
      } else if (presentNonLeaders.length > 0) {
        transportNames.push(presentNonLeaders[i % presentNonLeaders.length]);
      } else {
        transportNames.push(null);
      }
    }
    trans.forEach((t, i) => {
      transport[t] = transportNames[i];
    });

    // Restante (após support e transport) → divide nos almoços
    const allOps = [
      ...(Object.values(support).filter(Boolean) as string[]),
      ...(Object.values(transport).filter(Boolean) as string[]),
      ...pool,
    ];
    const uniqueOps = Array.from(new Set(allOps));
    const half = Math.ceil(uniqueOps.length / 2);
    const lunch1 = uniqueOps.slice(0, half);
    const lunch2 = uniqueOps.slice(half);

    setScale({ support, transport, lunch1, lunch2 });
  }


  function clearScale() {
    setScale(EMPTY_SCALE);
  }

  /* ────────── Render ────────── */
  return (
    <div className="space-y-3">
      {/* Topo: relógio + ações */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 via-card/60 to-card/40 p-4 shadow-lg backdrop-blur-xl print:avoid-break print:border-black print:bg-white print:p-3 print:shadow-none">
        <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-primary/10 blur-3xl print:hidden" />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:flex-row print:items-center print:justify-between print:gap-2">
          <div className="flex items-center gap-4 print:gap-2">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30 shadow-inner print:hidden">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight print:text-3xl print:text-black">
                POD da Equipe
              </h2>
              <p className="flex items-center gap-2 text-xs text-muted-foreground print:text-sm print:text-black">
                <Calendar className="size-3 print:hidden" />
                <span suppressHydrationWarning>
                  {now
                    ? now.toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "—"}
                </span>
                <span className="text-border print:text-black">•</span>
                <Clock className="size-3 print:hidden" />
                <span className="font-mono tabular-nums" suppressHydrationWarning>
                  {now ? now.toLocaleTimeString("pt-BR") : "--:--:--"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PremiumBtn icon={Shuffle} onClick={generateScale} tone="primary">
              Gerar Escala
            </PremiumBtn>
            <PremiumBtn icon={Eraser} onClick={clearScale} tone="ghost">
              Limpar
            </PremiumBtn>
            <PremiumBtn icon={Users} onClick={() => setEditColabs(true)} tone="ghost">
              Colaboradores
            </PremiumBtn>
            <PremiumBtn icon={Truck} onClick={() => setEditTrans(true)} tone="ghost">
              Transportadoras
            </PremiumBtn>
            <PremiumBtn icon={Printer} onClick={() => window.print()} tone="ghost">
              Imprimir
            </PremiumBtn>
          </div>
        </div>
      </section>

      {/* Card colaboradores presentes (retrátil) */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur print:hidden">
        <button
          type="button"
          onClick={() => setPresentOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-accent/30"
          aria-expanded={presentOpen}
        >
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Colaboradores Presentes</h3>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
              {present.length}/{colabs.length}
            </span>
          </div>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform duration-300 ${
              presentOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            presentOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3 px-4 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar colaborador…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {filteredColabs.map((c) => {
                  const on = presentSet.has(c);
                  const leader = LEADERS.includes(c as any);
                  return (
                    <button
                      key={c}
                      onClick={() => togglePresent(c)}
                      className={`group relative flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        on
                          ? leader
                            ? "border-warning/50 bg-warning/15 text-warning shadow-sm"
                            : "border-primary/50 bg-primary/15 text-primary shadow-sm"
                          : "border-border/50 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <span className="truncate">{c}</span>
                      {leader && <Crown className="size-3 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid principal */}
      <div className="grid gap-3 lg:grid-cols-12 print:gap-4 print:grid-cols-12 print:items-stretch">
        {/* Liderança */}
        <section className="lg:col-span-3 print:col-span-3 print:avoid-break">
          <PanelHeader icon={Crown} title="Liderança" tone="warning" />
          <div className="space-y-2 rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/10 via-card/60 to-card/40 p-3 shadow-inner backdrop-blur print:space-y-2 print:border-black print:bg-white print:p-3 print:shadow-none">
            {LEADERS.map((l) => {
              const here = presentSet.has(l);
              return (
                <div
                  key={l}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition ${
                    here
                      ? "border-warning/60 bg-warning/10 shadow-sm"
                      : "border-border/50 bg-background/30 opacity-60"
                  } print:py-2.5 print:px-3 print:border-black print:bg-white`}
                >
                  <div className="flex items-center gap-2 print:gap-1">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-warning/20 ring-1 ring-warning/40 print:hidden">
                      <Crown className="size-4 text-warning" />
                    </div>
                    <div>
                      <p className="font-display text-sm font-semibold tracking-tight print:text-xl print:text-black">{l}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground print:hidden">
                        {LEADER_ROLE[l] ?? "Líder operacional"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`size-2 rounded-full ${here ? "bg-success animate-pulse" : "bg-muted"} print:hidden`}
                  />
                </div>
              );
            })}
          </div>

          {/* Suporte */}
          <div className="mt-3 print:mt-4">
            <PanelHeader icon={HeartHandshake} title="Suporte Operacional" tone="primary" />
            <div className="space-y-1.5 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-inner backdrop-blur print:space-y-2 print:border-black print:bg-white print:p-3 print:shadow-none">
              {SUPPORT_ROLES.map((role) => (
                <AssignRow
                  key={role}
                  label={role}
                  value={scale.support[role] ?? null}
                  options={presentNonLeaders}
                  onChange={(v) =>
                    setScale((s) => ({ ...s, support: { ...s.support, [role]: v } }))
                  }
                />
              ))}
            </div>
          </div>
        </section>

        {/* Transportadoras */}
        <section className="lg:col-span-6 print:col-span-6 print:avoid-break">
          <PanelHeader icon={Truck} title="Transportadoras" tone="primary" />
          <div className="grid grid-cols-1 gap-2 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-inner backdrop-blur sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3 print:gap-2.5 print:border-black print:bg-white print:p-3 print:shadow-none">
            {trans.map((t) => {
              const assigned = scale.transport[t] ?? null;
              return (
                <div
                  key={t}
                  className="group relative overflow-hidden rounded-xl border border-border/60 bg-background/40 p-2.5 transition hover:border-primary/40 hover:shadow-md print:overflow-visible print:border-black print:bg-white print:p-2.5 print:shadow-none"
                >
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0 opacity-0 transition group-hover:opacity-100 print:hidden" />
                  <div className="mb-1.5 flex items-center justify-between gap-2 print:mb-0">
                    <p className="truncate text-xs font-semibold tracking-tight print:text-base print:text-black print:leading-tight">{t}</p>
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${
                        assigned ? "bg-success" : "bg-muted"
                      } print:hidden`}
                    />
                  </div>
                  <select
                    value={assigned ?? ""}
                    onChange={(e) =>
                      setScale((s) => ({
                        ...s,
                        transport: { ...s.transport, [t]: e.target.value || null },
                      }))
                    }
                    className="h-7 w-full rounded-md border border-border/60 bg-background/60 px-1.5 text-[11px] text-foreground focus:border-primary focus:outline-none print:h-9 print:border-black print:bg-white print:text-base print:text-black print:py-0"
                  >
                    <option value="">— sem responsável —</option>
                    {presentNonLeaders.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>

        {/* Almoços */}
        <section className="lg:col-span-3 print:col-span-3 print:avoid-break">
          <PanelHeader
            icon={UtensilsCrossed}
            title="Almoços"
            tone="success"
            action={
              <button
                onClick={() => setEditLunch(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition hover:border-success/40 hover:text-success print:hidden"
                aria-label="Editar Almoços"
              >
                <Pencil className="size-3" />
                Editar
              </button>
            }
          />
          <div className="space-y-2 print:space-y-3">
            <LunchCard
              title="1º Almoço"
              time="11:15 – 12:15"
              names={scale.lunch1}
              tone="from-success/15"
            />
            <LunchCard
              title="2º Almoço"
              time="12:15 – 13:15"
              names={scale.lunch2}
              tone="from-primary/15"
            />
          </div>
        </section>

      </div>

      {/* Orbitas de edição */}
      <EditListDialog
        open={editColabs}
        onOpenChange={setEditColabs}
        title="Editar Colaboradores"
        items={colabs}
        onChange={(next, renames) => {
          const prevColabs = colabs;
          setColabs(next);
          const rename = (n: string) => renames[n] ?? n;
          // novos = estão em next mas não vieram de um rename nem existiam antes
          const renamedTargets = new Set(Object.values(renames));
          const added = next.filter(
            (n) => !prevColabs.includes(n) && !renamedTargets.has(n),
          );
          setPresent((prev) => {
            const kept = Array.from(new Set(prev.map(rename))).filter((p) =>
              next.includes(p),
            );
            return Array.from(new Set([...kept, ...added]));
          });
          setScale((s) => {
            const support: Record<string, string | null> = {};
            for (const k of Object.keys(s.support)) {
              const v = s.support[k];
              support[k] = v && next.includes(rename(v)) ? rename(v) : null;
            }
            const transport: Record<string, string | null> = {};
            for (const k of Object.keys(s.transport)) {
              const v = s.transport[k];
              transport[k] = v && next.includes(rename(v)) ? rename(v) : null;
            }
            const filt = (arr: string[]) =>
              Array.from(new Set(arr.map(rename))).filter((n) => next.includes(n));
            return {
              support,
              transport,
              lunch1: filt(s.lunch1),
              lunch2: filt(s.lunch2),
            };
          });
        }}

        protectedItems={LEADERS as unknown as string[]}
      />
      <EditListDialog
        open={editTrans}
        onOpenChange={setEditTrans}
        title="Editar Transportadoras"
        items={trans}
        onChange={(next, renames) => {
          setTrans(next);
          setScale((s) => {
            const transport: Record<string, string | null> = {};
            for (const k of next) {
              const oldKey = Object.keys(renames).find((o) => renames[o] === k) ?? k;
              transport[k] = s.transport[oldKey] ?? null;
            }
            return { ...s, transport };
          });
        }}
      />
      <EditLunchDialog
        open={editLunch}
        onOpenChange={setEditLunch}
        lunch1={scale.lunch1}
        lunch2={scale.lunch2}
        options={presentNonLeaders}
        onSave={(l1, l2) => setScale((s) => ({ ...s, lunch1: l1, lunch2: l2 }))}
      />
    </div>
  );
}

/* ────────── Subcomponentes ────────── */

function PremiumBtn({
  icon: Icon,
  children,
  onClick,
  tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "primary" | "ghost";
}) {
  const cls =
    tone === "primary"
      ? "border-primary/40 bg-primary text-primary-foreground shadow-[0_0_24px_-6px] shadow-primary/50 hover:bg-primary/90"
      : "border-border/60 bg-card/60 text-foreground hover:border-primary/40 hover:bg-accent/40";
  return (
    <button
      onClick={onClick}
      className={`group inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-[0.98] ${cls}`}
    >
      <Icon className="size-3.5 transition group-hover:scale-110" />
      <span>{children}</span>
    </button>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  tone,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone: "primary" | "warning" | "success";
  action?: React.ReactNode;
}) {
  const colors: Record<typeof tone, string> = {
    primary: "text-primary",
    warning: "text-warning",
    success: "text-success",
  };
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 px-1 print:mb-1.5">
      <div className="flex items-center gap-2 print:gap-1">
        <Icon className={`size-3.5 ${colors[tone]} print:hidden`} />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground print:text-sm print:font-bold print:text-black print:normal-case print:tracking-normal">
          {title}
        </h3>
      </div>
      {action}
    </div>
  );
}


function AssignRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-2 py-1.5 print:border-black print:bg-white print:py-2 print:px-3">
      <span className="text-[11px] font-medium leading-tight print:text-base print:text-black print:leading-tight">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-7 w-[40%] shrink-0 rounded-md border border-border/60 bg-background/60 px-1.5 text-[11px] text-foreground focus:border-primary focus:outline-none print:h-9 print:w-[45%] print:border-black print:bg-white print:text-base print:text-black print:py-0"
      >
        <option value="">—</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function LunchCard({
  title,
  time,
  names,
  tone,
}: {
  title: string;
  time: string;
  names: string[];
  tone: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${tone} via-card/60 to-card/40 p-3 shadow-inner backdrop-blur print:rounded-lg print:border-black print:bg-white print:p-3 print:shadow-none`}
    >
      <div className="mb-2 flex items-center justify-between print:mb-1.5">
        <div>
          <p className="font-display text-sm font-semibold tracking-tight print:text-lg print:text-black">{title}</p>
          <p className="font-mono text-[10px] text-muted-foreground print:block print:text-sm print:text-black">{time}</p>
        </div>
        <span className="rounded-full bg-background/60 px-2 py-0.5 font-mono text-[10px] font-bold print:hidden">
          {names.length}
        </span>
      </div>
      {names.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/50 p-2 text-center text-[10px] text-muted-foreground print:border-black print:text-black print:p-2 print:text-sm">
          Gere a escala
        </p>
      ) : (
        <ul className="space-y-1 print:space-y-0.5">
          {names.map((n) => (
            <li
              key={n}
              className="truncate rounded-md bg-background/40 px-2 py-1 text-[11px] font-medium print:block print:truncate print:border-black print:border-b print:bg-white print:px-1.5 print:py-1 print:text-base print:text-black print:last:border-b-0"
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditListDialog({
  open,
  onOpenChange,
  title,
  items,
  onChange,
  protectedItems = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  items: string[];
  onChange: (next: string[], renames: Record<string, string>) => void;
  protectedItems?: string[];
}) {
  const [local, setLocal] = useState<string[]>(items);
  const [originals, setOriginals] = useState<(string | null)[]>(items.map((x) => x));
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  useEffect(() => {
    if (open) {
      setLocal(items);
      setOriginals(items.map((x) => x));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (local.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setLocal((p) => [...p, v]);
    setOriginals((p) => [...p, null]);
    setDraft("");
  }

  function remove(i: number) {
    const it = local[i];
    if (protectedItems.includes(it)) return;
    setLocal((p) => p.filter((_, idx) => idx !== i));
    setOriginals((p) => p.filter((_, idx) => idx !== i));
  }

  function commitEdit() {
    if (editing == null) return;
    const v = editingValue.trim();
    if (!v) return setEditing(null);
    setLocal((p) => p.map((x, i) => (i === editing ? v : x)));
    setEditing(null);
  }

  function save() {
    const renames: Record<string, string> = {};
    local.forEach((name, i) => {
      const orig = originals[i];
      if (orig && orig !== name) renames[orig] = name;
    });
    onChange(local, renames);
    onOpenChange(false);
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Novo nome…"
          />
          <Button onClick={add} size="icon" aria-label="Adicionar">
            <Plus className="size-4" />
          </Button>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {local.map((it, i) => {
            const isLocked = protectedItems.includes(it);
            const isEditing = editing === i;
            return (
              <li
                key={`${it}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2 py-1.5"
              >
                {isEditing ? (
                  <Input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                    className="h-7 text-xs"
                  />
                ) : (
                  <span className="flex-1 truncate text-sm">
                    {it}
                    {isLocked && (
                      <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning">
                        fixo
                      </span>
                    )}
                  </span>
                )}
                {!isLocked && (
                  <>
                    <button
                      onClick={() => {
                        setEditing(i);
                        setEditingValue(it);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => remove(i)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      aria-label="Remover"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="size-4" /> Cancelar
          </Button>
          <Button onClick={save}>
            <Save className="size-4" /> Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditLunchDialog({
  open,
  onOpenChange,
  lunch1,
  lunch2,
  options,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lunch1: string[];
  lunch2: string[];
  options: string[];
  onSave: (l1: string[], l2: string[]) => void;
}) {
  const [l1, setL1] = useState<string[]>(lunch1);
  const [l2, setL2] = useState<string[]>(lunch2);

  useEffect(() => {
    if (open) {
      setL1(lunch1);
      setL2(lunch2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(list: 1 | 2, name: string) {
    const setter = list === 1 ? setL1 : setL2;
    setter((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function clear(list: 1 | 2) {
    (list === 1 ? setL1 : setL2)([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar escala de almoços</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {([1, 2] as const).map((slot) => {
            const list = slot === 1 ? l1 : l2;
            return (
              <div key={slot} className="rounded-xl border border-border/60 bg-background/40 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold">
                    {slot === 1 ? "1º Almoço" : "2º Almoço"}{" "}
                    <span className="text-muted-foreground">({list.length})</span>
                  </p>
                  <button
                    onClick={() => clear(slot)}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    Limpar
                  </button>
                </div>
                <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {options.map((name) => {
                    const on = list.includes(name);
                    return (
                      <li key={name}>
                        <button
                          onClick={() => toggle(slot, name)}
                          className={`flex w-full items-center justify-between rounded-md border px-2 py-1 text-[11px] transition ${
                            on
                              ? "border-success/50 bg-success/15 text-success"
                              : "border-border/50 bg-background/60 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span className="truncate">{name}</span>
                          {on && <span className="font-mono text-[10px]">✓</span>}
                        </button>
                      </li>
                    );
                  })}
                  {options.length === 0 && (
                    <li className="rounded border border-dashed border-border/50 p-2 text-center text-[10px] text-muted-foreground">
                      Nenhum colaborador presente
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="size-4" /> Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(l1, l2);
              onOpenChange(false);
            }}
          >
            <Save className="size-4" /> Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
