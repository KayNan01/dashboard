import { useEffect, useState } from "react";

export const SACA_PEDIDOS = 40;
export const CAMINHAO_SACAS = 160;
export const ALERTA_SACAS = 145;
// 56 caixas Marketplace Full = 21 sacas  →  1 saca = 56/21 ≈ 2.6667 caixas
export const CAIXAS_POR_SACA = 56 / 21;

export type Grupo = "HUB" | "TERCEIRIZADAS";

export interface Transportadora {
  nome: string;
  pct: number; // 0-100
  grupo: Grupo;
}

export const TRANSPORTADORAS: Transportadora[] = [
  { nome: "SWIFTLANE", pct: 9.1, grupo: "HUB" },
  { nome: "NORTHLINE", pct: 11.1, grupo: "HUB" },
  { nome: "VELOCE", pct: 13.4, grupo: "HUB" },
  { nome: "CORELOG", pct: 7.2, grupo: "HUB" },
  { nome: "ORBITA", pct: 9.8, grupo: "HUB" },
  { nome: "TITAN", pct: 5.5, grupo: "TERCEIRIZADAS" },
  { nome: "METRO ENTREGAS", pct: 0.3, grupo: "TERCEIRIZADAS" },
  { nome: "RAPIDLOG", pct: 14.7, grupo: "TERCEIRIZADAS" },
  { nome: "MARKETPLACE", pct: 23.1, grupo: "TERCEIRIZADAS" },
  { nome: "BAZAAR", pct: 5.5, grupo: "TERCEIRIZADAS" },
  { nome: "TIK TOK", pct: 0.1, grupo: "TERCEIRIZADAS" },
  { nome: "RETIRA LOJA", pct: 0.1, grupo: "TERCEIRIZADAS" },
  { nome: "RETIRAR", pct: 0.2, grupo: "TERCEIRIZADAS" },
];

export interface DistribuicaoItem extends Transportadora {
  pedidos: number;
}

export interface ProjectionMetrics {
  total: number;
  caixasMercadoFull: number;
  distribuicao: DistribuicaoItem[];
  hubPedidos: number;
  terceirizadasPedidos: number;
  sacasHub: number;
  sacasMercadoFull: number;
  sacasTotais: number;
  ocupacaoPct: number;
  caminhoesNecessarios: number;
  superlotacao: boolean;
  diferencaLimite: number;
}

export function computeProjection(
  total: number,
  caixasMercadoFull = 0,
  sacaPedidos: number = SACA_PEDIDOS,
  pctOverrides: Record<string, number> = {},
): ProjectionMetrics {
  const distribuicao = TRANSPORTADORAS.map((t) => {
    const pct = Number.isFinite(pctOverrides[t.nome]) ? pctOverrides[t.nome] : t.pct;
    return { ...t, pct, pedidos: Math.round((total * pct) / 100) };
  });
  const hubPedidos = distribuicao
    .filter((d) => d.grupo === "HUB")
    .reduce((s, d) => s + d.pedidos, 0);
  const terceirizadasPedidos = distribuicao
    .filter((d) => d.grupo === "TERCEIRIZADAS")
    .reduce((s, d) => s + d.pedidos, 0);
  const sacaDiv = Math.max(1, sacaPedidos || SACA_PEDIDOS);
  const sacasHub = Math.ceil(hubPedidos / sacaDiv);
  const sacasMercadoFull = Math.ceil(Math.max(0, caixasMercadoFull) / CAIXAS_POR_SACA);
  const sacasTotais = sacasHub + sacasMercadoFull;
  const ocupacaoPct = Math.trunc((sacasTotais / CAMINHAO_SACAS) * 100);
  const caminhoesNecessarios = Math.max(1, Math.ceil(sacasTotais / CAMINHAO_SACAS));
  const superlotacao = sacasTotais >= ALERTA_SACAS;
  const diferencaLimite = CAMINHAO_SACAS - sacasTotais;
  return {
    total,
    caixasMercadoFull: Math.max(0, caixasMercadoFull),
    distribuicao,
    hubPedidos,
    terceirizadasPedidos,
    sacasHub,
    sacasMercadoFull,
    sacasTotais,
    ocupacaoPct,
    caminhoesNecessarios,
    superlotacao,
    diferencaLimite,
  };
}

export function limiteTone(sacasTotais: number): "success" | "warning" | "caution" | "danger" {
  if (sacasTotais < 130) return "success";
  if (sacasTotais <= 144) return "warning";
  if (sacasTotais <= 156) return "caution";
  return "danger";
}

const STORAGE_KEY = "projection.total";
const STORAGE_KEY_MF = "projection.mercadoFullCaixas";

function usePersistedNumber(key: string, initial: number): [number, (n: number) => void] {
  const [value, setValue] = useState<number>(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) setValue(n);
    }
  }, [key]);
  const update = (n: number) => {
    setValue(n);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, String(n));
    }
  };
  return [value, update];
}

export function useProjectionTotal(): [number, (n: number) => void] {
  return usePersistedNumber(STORAGE_KEY, 21000);
}

export function useMercadoFullCaixas(): [number, (n: number) => void] {
  return usePersistedNumber(STORAGE_KEY_MF, 0);
}

export function useSacaPedidos(): [number, (n: number) => void] {
  return usePersistedNumber("projection.sacaPedidos", SACA_PEDIDOS);
}

const STORAGE_KEY_PCT = "projection.hubPct.v1";

export function useHubPercentuais(): [Record<string, number>, (nome: string, pct: number) => void, () => void] {
  const [map, setMap] = useState<Record<string, number>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY_PCT);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setMap(parsed as Record<string, number>);
      } catch {
        /* ignore */
      }
    }
  }, []);
  const setPct = (nome: string, pct: number) => {
    setMap((prev) => {
      const next = { ...prev, [nome]: Math.max(0, Math.min(100, pct)) };
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY_PCT, JSON.stringify(next));
      return next;
    });
  };
  const reset = () => {
    setMap({});
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY_PCT);
  };
  return [map, setPct, reset];
}
