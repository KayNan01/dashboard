// Motor de Correlação Inteligente.
// Estima em qual grupo (HUB/TERCEIRIZADAS) cada colaborador está trabalhando
// analisando somente as variações entre snapshots consecutivos:
//   - deltas positivos de pedidos bipados por colaborador (WMS)
//   - incremento de FATURADO C/CARGA por grupo (Filtro Operacional):
//     quando uma transportadora sobe o número em FATURADO C/CARGA, aquele
//     incremento é o "bipado" do grupo naquela janela.
// Determinístico: mantém eventos pendentes para casar atualizações que chegam
// em horários diferentes. Não distribui o total por porcentagem estimada.
// Reinicia sozinho no rollover de dia (sem histórico entre dias).

export interface Attribution {
  hub: number;
  terc: number;
  total: number;
  hubPct: number;
  tercPct: number;
}

interface Snapshot {
  timestamp: number;
  users: Record<string, number>;
  carriers: Record<string, CarrierSnapshot>;
}

export interface CarrierSignal {
  id: string;
  grupo: "HUB" | "TERCEIRIZADAS";
  /** FATURADO C/CARGA (fila de carregamento). */
  count: number;
  /** Soma das demais filas da transportadora (AG + SEP + FAT + FAT S/CARGA). */
  outras?: number;
}

interface CarrierSnapshot {
  grupo: "HUB" | "TERCEIRIZADAS";
  count: number;
  outras: number;
}

interface PendingUserDelta {
  eventId: number;
  name: string;
  amount: number;
  seenAt: number;
}

interface PendingSignal {
  id: string;
  grupo: "HUB" | "TERCEIRIZADAS";
  amount: number;
  seenAt: number;
}

/** Saída de caminhão detectada: a fila C/CARGA caiu sem que outra fila subisse. */
interface PendingDeparture {
  grupo: "HUB" | "TERCEIRIZADAS";
  amount: number;
  seenAt: number;
}

export interface CorrelationState {
  dayKey: string;
  last: Snapshot | null;
  attribution: Record<string, Attribution>;
  confidence: number;
  history: number[];
  pendingUserDeltas: PendingUserDelta[];
  pendingSignals: PendingSignal[];
  pendingDepartures: PendingDeparture[];
  nextEventId: number;
  lastMatchAt: number | null;
}

const WINDOW = 20;
// As duas bases (produtividade e filtro operacional) atualizam fora de fase;
// 6 min de janela evita descartar eventos reais por defasagem.
const PENDING_TTL_MS = 360_000;

export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function initCorrelation(dayKey = todayKey()): CorrelationState {
  return {
    dayKey,
    last: null,
    attribution: {},
    confidence: 0,
    history: [],
    pendingUserDeltas: [],
    pendingSignals: [],
    pendingDepartures: [],
    nextEventId: 1,
    lastMatchAt: null,
  };
}

function emptyAttribution(): Attribution {
  return { hub: 0, terc: 0, total: 0, hubPct: 0, tercPct: 0 };
}

function buildCarrierSnapshot(signals: CarrierSignal[]): Record<string, CarrierSnapshot> {
  const carriers: Record<string, CarrierSnapshot> = {};
  for (const signal of signals) {
    const id = signal.id.trim().toUpperCase();
    if (!id) continue;
    const current = carriers[id];
    carriers[id] = {
      grupo: signal.grupo,
      count: (current?.count ?? 0) + Math.max(0, Math.trunc(signal.count || 0)),
      outras: (current?.outras ?? 0) + Math.max(0, Math.trunc(signal.outras || 0)),
    };
  }
  return carriers;
}


function groupAffinity(name: string, group: "HUB" | "TERCEIRIZADAS", prior: Record<string, Attribution>): number {
  const p = prior[name];
  if (!p) return 0;
  const total = p.hub + p.terc;
  if (total <= 0) return 0;
  return group === "HUB" ? p.hub / total : p.terc / total;
}

function allocatePending(
  userDeltas: PendingUserDelta[],
  groupSignals: PendingSignal[],
  prior: Record<string, Attribution>,
  departures: PendingDeparture[] = [],
): {
  assign: Record<string, { hub: number; terc: number }>;
  remainingUserDeltas: PendingUserDelta[];
  remainingSignals: PendingSignal[];
  confidence: number;
  matched: boolean;
} {

  const assign: Record<string, { hub: number; terc: number }> = {};
  for (const d of userDeltas) assign[d.name] = { hub: 0, terc: 0 };

  const remaining = userDeltas.filter((d) => d.amount > 0).map((d) => ({ ...d }));
  const signals = groupSignals.filter((s) => s.amount > 0).map((s) => ({ ...s }));
  const originalUserTotal = remaining.reduce((sum, d) => sum + d.amount, 0);
  const liveDepartures = departures.filter((d) => d.amount > 0);
  if (
    remaining.length === 0
    || originalUserTotal === 0
    || (signals.length === 0 && liveDepartures.length === 0)
  ) {
    return {
      assign,
      remainingUserDeltas: remaining,
      remainingSignals: signals,
      confidence: 0,
      matched: false,
    };
  }


  const usedEvents = new Set<number>();

  function availableEvents() {
    return remaining.filter((d) => !usedEvents.has(d.eventId));
  }

  function pickExactSubset(target: number, group: "HUB" | "TERCEIRIZADAS"): number[] | null {
    if (target <= 0) return null;
    type Choice = { ids: number[]; score: number; ambiguous: boolean };
    const dp = new Map<number, Choice>();
    dp.set(0, { ids: [], score: 0, ambiguous: false });
    for (const event of availableEvents()) {
      const snapshot = [...dp.entries()];
      for (const [sum, choice] of snapshot) {
        const next = sum + event.amount;
        if (next > target) continue;
        const nextChoice: Choice = {
          ids: [...choice.ids, event.eventId],
          score: choice.score + groupAffinity(event.name, group, prior),
          ambiguous: choice.ambiguous,
        };
        const current = dp.get(next);
        const better = !current
          || nextChoice.score > current.score + 1e-9
          || (Math.abs(nextChoice.score - current.score) <= 1e-9 && nextChoice.ids.length < current.ids.length);
        const equal = current
          && Math.abs(nextChoice.score - current.score) <= 1e-9
          && nextChoice.ids.length === current.ids.length
          && nextChoice.ids.join("|") !== current.ids.join("|");
        if (better) dp.set(next, nextChoice);
        else if (equal) dp.set(next, { ...current, ambiguous: true });
      }
    }
    const result = dp.get(target);
    if (!result || result.ambiguous) return null;
    return result.ids;
  }

  function pickUniqueCandidate(
    candidates: PendingUserDelta[],
    signal: PendingSignal,
  ): PendingUserDelta | null {
    if (candidates.length === 0) return null;
    const ranked = candidates
      .map((event) => ({
        event,
        closeness: event.amount - signal.amount,
        time: Math.abs(event.seenAt - signal.seenAt),
        affinity: groupAffinity(event.name, signal.grupo, prior),
      }))
      .sort((a, b) => {
        if (a.closeness !== b.closeness) return a.closeness - b.closeness;
        if (a.time !== b.time) return a.time - b.time;
        return b.affinity - a.affinity;
      });
    const first = ranked[0];
    const second = ranked[1];
    if (!first) return null;
    if (!second) return first.event;
    const tied = first.closeness === second.closeness
      && first.time === second.time
      && Math.abs(first.affinity - second.affinity) <= 1e-9;
    return tied ? null : first.event;
  }

  function assignAmount(event: PendingUserDelta, group: "HUB" | "TERCEIRIZADAS", amount: number) {
    const take = Math.min(event.amount, amount);
    if (take <= 0) return 0;
    const current = assign[event.name] ?? { hub: 0, terc: 0 };
    if (group === "HUB") current.hub += take;
    else current.terc += take;
    assign[event.name] = current;
    event.amount -= take;
    if (event.amount <= 0) usedEvents.add(event.eventId);
    return take;
  }

  function assignEvents(ids: number[], group: "HUB" | "TERCEIRIZADAS") {
    for (const id of ids) {
      const event = remaining.find((d) => d.eventId === id);
      if (!event || usedEvents.has(id)) continue;
      assignAmount(event, group, event.amount);
    }
  }

  function consumeSignalAmount(group: "HUB" | "TERCEIRIZADAS", amount: number) {
    let rest = amount;
    for (const signal of signals) {
      if (rest <= 0 || signal.grupo !== group || signal.amount <= 0) continue;
      const take = Math.min(rest, signal.amount);
      signal.amount -= take;
      rest -= take;
    }
  }

  // 1) Primeiro tenta casar exatamente cada aumento de transportadora.
  // Ex.: SWIFTLANE +10 e CARLOS +10 => CARLOS recebe HUB +10.
  for (const signal of [...signals].sort((a, b) => a.amount - b.amount)) {
    if (signal.amount <= 0) continue;
    const ids = pickExactSubset(signal.amount, signal.grupo);
    if (!ids) continue;
    assignEvents(ids, signal.grupo);
    signal.amount = 0;
  }

  // Caso comum com defasagem de atualização: o colaborador bipou um pouco
  // mais que o aumento da transportadora. Atribui só a quantidade real que
  // subiu em C/Carga e mantém o restante pendente/cinza.
  for (const signal of [...signals].sort((a, b) => a.amount - b.amount)) {
    if (signal.amount <= 0) continue;
    const candidate = pickUniqueCandidate(
      availableEvents().filter((event) => event.amount >= signal.amount),
      signal,
    );
    if (!candidate) continue;
    const taken = assignAmount(candidate, signal.grupo, signal.amount);
    signal.amount -= taken;
  }

  // Caso seguro sem palpite: se só há um colaborador com delta pendente, ele
  // pode consumir o aumento real do C/Carga, até o limite do que ele bipou.
  for (const signal of signals) {
    if (signal.amount <= 0) continue;
    const available = availableEvents();
    if (available.length !== 1) continue;
    const taken = assignAmount(available[0], signal.grupo, signal.amount);
    signal.amount -= taken;
  }

  // 2) Se não houver casamento por transportadora, tenta por grupo somente
  // quando há soma exata ou quando apenas um grupo teve sinal suficiente.
  const groupOrder: ("HUB" | "TERCEIRIZADAS")[] = ["HUB", "TERCEIRIZADAS"].sort((a, b) => {
    const sa = signals.filter((s) => s.grupo === a).reduce((sum, s) => sum + s.amount, 0);
    const sb = signals.filter((s) => s.grupo === b).reduce((sum, s) => sum + s.amount, 0);
    return sa - sb;
  }) as ("HUB" | "TERCEIRIZADAS")[];

  for (const group of groupOrder) {
    const available = availableEvents();
    if (available.length === 0) break;
    const groupTotal = signals.filter((s) => s.grupo === group).reduce((sum, s) => sum + s.amount, 0);
    if (groupTotal <= 0) continue;
    const otherTotal = signals.filter((s) => s.grupo !== group).reduce((sum, s) => sum + s.amount, 0);
    const availableTotal = available.reduce((sum, d) => sum + d.amount, 0);

    if (otherTotal <= 0 && groupTotal >= availableTotal) {
      assignEvents(available.map((d) => d.eventId), group);
      consumeSignalAmount(group, availableTotal);
      continue;
    }

    if (groupTotal <= availableTotal) {
      const ids = pickExactSubset(groupTotal, group);
      if (!ids) continue;
      assignEvents(ids, group);
      consumeSignalAmount(group, groupTotal);
    }
  }

  // 3) Grupo absorvente: quando um caminhão sai, a fila C/CARGA cai e o
  // aumento real fica escondido. Se, na janela, apenas UM grupo teve saída de
  // caminhão e todos os sinais do outro grupo já foram consumidos, os pedidos
  // restantes só podem ter ido para o grupo que teve a saída.
  const departureGroups = new Set(liveDepartures.map((d) => d.grupo));
  if (departureGroups.size === 1) {
    const absorbing = [...departureGroups][0];
    const otherPending = signals
      .filter((s) => s.grupo !== absorbing)
      .reduce((sum, s) => sum + s.amount, 0);
    if (otherPending <= 0) {
      const available = availableEvents();
      if (available.length > 0) {
        assignEvents(available.map((d) => d.eventId), absorbing);
        consumeSignalAmount(absorbing, available.reduce((sum, d) => sum + d.amount, 0));
      }
    }
  }

  const remainingUserDeltas = remaining.filter((d) => !usedEvents.has(d.eventId) && d.amount > 0);
  const remainingSignals = signals.filter((s) => s.amount > 0);
  const assignedTotal = originalUserTotal - remainingUserDeltas.reduce((sum, d) => sum + d.amount, 0);
  const confidence = originalUserTotal > 0 ? assignedTotal / originalUserTotal : 0;

  return { assign, remainingUserDeltas, remainingSignals, confidence, matched: assignedTotal > 0 };
}


export function ingestSnapshot(
  state: CorrelationState,
  users: Record<string, number>,
  carrierSignals: CarrierSignal[],
  now = new Date(),
): CorrelationState {
  const dayKey = todayKey(now);
  const base = dayKey !== state.dayKey ? initCorrelation(dayKey) : state;
  const nowMs = now.getTime();
  const carriers = buildCarrierSnapshot(carrierSignals);

  const snap: Snapshot = {
    timestamp: nowMs,
    users: { ...users },
    carriers,
  };

  if (!base.last) {
    const attribution = { ...base.attribution };
    for (const name of Object.keys(users)) {
      if (!attribution[name]) attribution[name] = emptyAttribution();
    }
    return { ...base, last: snap, attribution };
  }

  const names = new Set<string>([...Object.keys(users), ...Object.keys(base.last.users)]);
  let pendingUserDeltas = (base.pendingUserDeltas ?? []).filter((d) => nowMs - d.seenAt <= PENDING_TTL_MS);
  let nextEventId = base.nextEventId ?? 1;
  for (const name of names) {
    const current = users[name] ?? 0;
    const before = base.last.users[name] ?? 0;
    const amount = Math.max(0, current - before);
    if (amount > 0) {
      pendingUserDeltas = [...pendingUserDeltas, { eventId: nextEventId, name, amount, seenAt: nowMs }];
      nextEventId += 1;
    }
  }

  let pendingSignals = (base.pendingSignals ?? []).filter((s) => nowMs - s.seenAt <= PENDING_TTL_MS);
  let pendingDepartures = (base.pendingDepartures ?? []).filter((d) => nowMs - d.seenAt <= PENDING_TTL_MS);
  const lastCarriers = base.last.carriers ?? {};
  const carrierIds = new Set<string>([...Object.keys(carriers), ...Object.keys(lastCarriers)]);
  for (const id of carrierIds) {
    const current = carriers[id];
    const before = lastCarriers[id];
    const grupo = current?.grupo ?? before?.grupo ?? "TERCEIRIZADAS";
    const delta = (current?.count ?? 0) - (before?.count ?? 0);
    const deltaOutras = (current?.outras ?? 0) - (before?.outras ?? 0);

    if (delta > 0) {
      // Entrada real em carga: bipagem confirmada nesta transportadora.
      pendingSignals = [...pendingSignals, { id, grupo, amount: delta, seenAt: nowMs }];
      continue;
    }

    // Queda em C/CARGA sem aumento em nenhuma outra fila da transportadora =
    // caminhão saiu (expedição). Não é sinal de bipagem, mas indica que o
    // fluxo daquele grupo ficou escondido nesta janela.
    if (delta < 0 && deltaOutras <= 0) {
      pendingDepartures = [...pendingDepartures, { grupo, amount: -delta, seenAt: nowMs }];
    }
  }

  const { assign, remainingUserDeltas, remainingSignals, confidence, matched } = allocatePending(
    pendingUserDeltas,
    pendingSignals,
    base.attribution,
    pendingDepartures,
  );

  const attribution: Record<string, Attribution> = { ...base.attribution };
  for (const [name, a] of Object.entries(assign)) {
    const cur = attribution[name] ?? emptyAttribution();
    const hub = cur.hub + a.hub;
    const terc = cur.terc + a.terc;
    const total = hub + terc;
    attribution[name] = {
      hub,
      terc,
      total,
      hubPct: total > 0 ? (hub / total) * 100 : 0,
      tercPct: total > 0 ? (terc / total) * 100 : 0,
    };
  }
  for (const name of Object.keys(users)) {
    if (!attribution[name]) attribution[name] = emptyAttribution();
  }

  const history = [...base.history, confidence].slice(-WINDOW);
  const avg = history.reduce((s, v) => s + v, 0) / history.length;

  return {
    dayKey,
    last: snap,
    attribution,
    confidence: avg,
    history,
    pendingUserDeltas: remainingUserDeltas,
    pendingSignals: remainingSignals,
    // As saídas já usadas expiram naturalmente pelo TTL; mantê-las evita
    // perder o contexto quando o colaborador aparece um ciclo depois.
    pendingDepartures,
    nextEventId,
    lastMatchAt: matched ? nowMs : base.lastMatchAt ?? null,
  };
}

