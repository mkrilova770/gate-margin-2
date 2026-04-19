import { getTradingFeesPercent } from "@/lib/fees";
import { adapters } from "@/lib/exchanges";
import { fetchGateBorrowInfo, fetchGateMarginPairs, fetchGateSpotMap } from "@/lib/exchanges/gate";
import { fetchKucoinMarginData, fetchKucoinMarginPairs } from "@/lib/exchanges/kucoinMargin";
import { toFundingAPR, toSpreadPercent } from "@/lib/math";
import type { ArbitrageRow, FundingInfo, GateBorrowRow, KucoinBorrowRow, MarginSourceId, ScanApiResponse } from "@/types";
import { NextResponse } from "next/server";

const SCAN_SWR_TTL_MS = Number(process.env.SCAN_SWR_TTL_MS ?? 20_000);

interface CacheEntry {
  response: ScanApiResponse;
  at: number;
}

const lastGoodByKey = new Map<string, CacheEntry>();
const inFlightByKey = new Map<string, Promise<ScanApiResponse>>();

function isFresh(entry: CacheEntry | null): boolean {
  return !!entry && Date.now() - entry.at <= SCAN_SWR_TTL_MS;
}

function normalizeCacheKey(selectedExchanges: Set<string> | null, marginSources: Set<MarginSourceId>): string {
  const exPart = !selectedExchanges || selectedExchanges.size === 0
    ? "ALL"
    : [...selectedExchanges].sort().join(",");
  const mPart = [...marginSources].sort().join(",") || "Gate";
  return `${exPart}|m:${mPart}`;
}

function pickBestBorrow(
  gateAPR: number | null,
  kucoinAPR: number | null,
): { borrowAPR: number | null; borrowSource: MarginSourceId | null } {
  const gOk = gateAPR != null && Number.isFinite(gateAPR);
  const kOk = kucoinAPR != null && Number.isFinite(kucoinAPR);
  if (gOk && kOk) {
    return gateAPR! <= kucoinAPR!
      ? { borrowAPR: gateAPR, borrowSource: "Gate" }
      : { borrowAPR: kucoinAPR, borrowSource: "KuCoin" };
  }
  if (gOk) return { borrowAPR: gateAPR, borrowSource: "Gate" };
  if (kOk) return { borrowAPR: kucoinAPR, borrowSource: "KuCoin" };
  return { borrowAPR: null, borrowSource: null };
}

function createRow(
  funding: FundingInfo,
  gateBorrow: GateBorrowRow | null,
  kucoinBorrow: KucoinBorrowRow | null,
  spotPrice: number | null,
): ArbitrageRow {
  const fundingAPR = toFundingAPR(funding.rawFundingRate, funding.intervalHours);
  const borrowAPR_gate = gateBorrow?.borrowAPR ?? null;
  const borrowAPR_kucoin = kucoinBorrow?.borrowAPR ?? null;
  const { borrowAPR, borrowSource } = pickBestBorrow(borrowAPR_gate, borrowAPR_kucoin);
  const tradingFees = getTradingFeesPercent(funding.exchange);
  const netAPR =
    fundingAPR == null || borrowAPR == null ? null : fundingAPR - borrowAPR - tradingFees;
  return {
    id: `${funding.token}-${funding.exchange}`,
    token: funding.token,
    exchange: funding.exchange,
    rawFunding: funding.rawFundingRate,
    intervalHours: funding.intervalHours,
    fundingAPR,
    borrowAPR,
    borrowAPR_gate,
    borrowAPR_kucoin,
    borrowSource,
    tradingFees,
    netAPR,
    spread: toSpreadPercent(funding.futuresPrice, spotPrice),
    futuresPrice: funding.futuresPrice,
    spotPrice,
    borrowLiquidityToken: gateBorrow?.borrowLiquidityToken ?? null,
    borrowLiquidityUsdt: gateBorrow?.borrowLiquidityUsdt ?? null,
    kucoinMaxBorrow: kucoinBorrow?.maxBorrow ?? null,
    kucoinEstimatedUsdt: kucoinBorrow?.estimatedUsdt
      ?? (kucoinBorrow?.maxBorrow != null && spotPrice != null
        ? kucoinBorrow.maxBorrow * spotPrice
        : null),
    nextFundingTime: funding.nextFundingTime,
    updatedAt: funding.updatedAt,
  };
}

async function buildScan(
  selectedExchanges: Set<string> | null,
  marginSources: Set<MarginSourceId>,
): Promise<ScanApiResponse> {
  const errors: string[] = [];
  const useGate = marginSources.has("Gate");
  const useKucoin = marginSources.has("KuCoin");

  const universeTokens = new Set<string>();

  const [gateMarginResult, kucoinMarginResult] = await Promise.allSettled([
    useGate ? fetchGateMarginPairs() : Promise.resolve([]),
    useKucoin ? fetchKucoinMarginPairs() : Promise.resolve(new Set<string>()),
  ]);

  if (gateMarginResult.status === "fulfilled") {
    for (const pair of gateMarginResult.value as string[]) {
      if (pair.endsWith("_USDT")) {
        universeTokens.add(pair.split("_")[0].toUpperCase());
      }
    }
  } else if (useGate) {
    errors.push(`GateMarginPairs: ${gateMarginResult.reason instanceof Error ? gateMarginResult.reason.message : "unknown error"}`);
  }

  if (kucoinMarginResult.status === "fulfilled") {
    for (const token of kucoinMarginResult.value as Set<string>) {
      universeTokens.add(token);
    }
  } else if (useKucoin) {
    errors.push(`KuCoinMarginPairs: ${kucoinMarginResult.reason instanceof Error ? kucoinMarginResult.reason.message : "unknown error"}`);
  }

  const activeAdapters = selectedExchanges
    ? adapters.filter((adapter) => selectedExchanges.has(adapter.id))
    : adapters;

  const settled = await Promise.allSettled(activeAdapters.map((adapter) => adapter.fetchFunding()));
  const fundingRows: FundingInfo[] = [];
  settled.forEach((result, index) => {
    const adapterId = activeAdapters[index].id;
    if (result.status === "fulfilled") {
      fundingRows.push(...result.value.filter((row) => universeTokens.has(row.token)));
    } else {
      errors.push(`${adapterId}: ${result.reason instanceof Error ? result.reason.message : "unknown error"}`);
    }
  });

  const relevantTokens = [...new Set(fundingRows.map((row) => row.token))];

  const fetchTasks: Promise<unknown>[] = [
    useGate ? fetchGateBorrowInfo(relevantTokens) : Promise.resolve(new Map<string, GateBorrowRow>()),
    useKucoin ? fetchKucoinMarginData() : Promise.resolve(new Map<string, KucoinBorrowRow>()),
    fetchGateSpotMap(),
  ];

  const [borrowGateResult, borrowKucoinResult, spotResult] = await Promise.allSettled(fetchTasks);

  const gateBorrowMap = borrowGateResult.status === "fulfilled"
    ? borrowGateResult.value as Map<string, GateBorrowRow>
    : new Map<string, GateBorrowRow>();
  const kucoinBorrowMap = borrowKucoinResult.status === "fulfilled"
    ? borrowKucoinResult.value as Map<string, KucoinBorrowRow>
    : new Map<string, KucoinBorrowRow>();
  const spotMap = spotResult.status === "fulfilled"
    ? spotResult.value as Map<string, number>
    : new Map<string, number>();

  if (borrowGateResult.status === "rejected" && useGate) {
    errors.push(`GateBorrow: ${borrowGateResult.reason instanceof Error ? borrowGateResult.reason.message : "unknown error"}`);
  }
  if (borrowKucoinResult.status === "rejected" && useKucoin) {
    errors.push(`KuCoinBorrow: ${borrowKucoinResult.reason instanceof Error ? borrowKucoinResult.reason.message : "unknown error"}`);
  }
  if (spotResult.status === "rejected") {
    errors.push(`GateSpot: ${spotResult.reason instanceof Error ? spotResult.reason.message : "unknown error"}`);
  }

  const rows = fundingRows.map((funding) =>
    createRow(
      funding,
      gateBorrowMap.get(funding.token) ?? null,
      kucoinBorrowMap.get(funding.token) ?? null,
      spotMap.get(`${funding.token}_USDT`) ?? null,
    )
  );

  rows.sort((a, b) => (b.netAPR ?? -99999) - (a.netAPR ?? -99999));
  return { rows, fetchedAt: new Date().toISOString(), errors };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const exchangesQuery = url.searchParams.get("exchanges");
  const selectedExchanges =
    exchangesQuery && exchangesQuery.trim()
      ? new Set(exchangesQuery.split(",").map((value) => value.trim()).filter(Boolean))
      : null;

  const marginQuery = url.searchParams.get("marginSources");
  const marginSources = new Set<MarginSourceId>();
  if (marginQuery && marginQuery.trim()) {
    for (const s of marginQuery.split(",")) {
      const v = s.trim();
      if (v === "Gate" || v === "KuCoin") marginSources.add(v);
    }
  }
  if (marginSources.size === 0) marginSources.add("Gate");

  const cacheKey = normalizeCacheKey(selectedExchanges, marginSources);
  const cached = lastGoodByKey.get(cacheKey) ?? null;

  if (isFresh(cached)) {
    return NextResponse.json(cached!.response);
  }

  if (cached) {
    if (!inFlightByKey.has(cacheKey)) {
      inFlightByKey.set(
        cacheKey,
        buildScan(selectedExchanges, marginSources)
        .then((next) => {
          lastGoodByKey.set(cacheKey, { response: next, at: Date.now() });
          return next;
        })
        .finally(() => {
          inFlightByKey.delete(cacheKey);
        })
      );
    }
    return NextResponse.json(cached.response);
  }

  if (!inFlightByKey.has(cacheKey)) {
    inFlightByKey.set(
      cacheKey,
      buildScan(selectedExchanges, marginSources)
      .then((next) => {
        lastGoodByKey.set(cacheKey, { response: next, at: Date.now() });
        return next;
      })
      .finally(() => {
        inFlightByKey.delete(cacheKey);
      })
    );
  }

  try {
    const payload = await inFlightByKey.get(cacheKey)!;
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        rows: [],
        fetchedAt: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : "scan failed"],
      },
      { status: 500 }
    );
  }
}
