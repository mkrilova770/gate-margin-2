import { getTradingFeesPercent } from "@/lib/fees";
import { adapters } from "@/lib/exchanges";
import { fetchGateBorrowInfo, fetchGateMarginPairs, fetchGateSpotMap } from "@/lib/exchanges/gate";
import { toFundingAPR, toSpreadPercent } from "@/lib/math";
import type { ArbitrageRow, FundingInfo, ScanApiResponse } from "@/types";
import { NextResponse } from "next/server";

const SCAN_SWR_TTL_MS = Number(process.env.SCAN_SWR_TTL_MS ?? 20_000);

let lastGoodResponse: ScanApiResponse | null = null;
let lastGoodAt = 0;
let coldBuildInFlight: Promise<ScanApiResponse> | null = null;

function isFresh(): boolean {
  return !!lastGoodResponse && Date.now() - lastGoodAt <= SCAN_SWR_TTL_MS;
}

function createRow(funding: FundingInfo, borrow: ReturnType<Map<string, unknown>["get"]>, spotPrice: number | null): ArbitrageRow {
  const b = (borrow ?? null) as
    | {
        borrowAPR: number | null;
        borrowLiquidityToken: number | null;
        borrowLiquidityUsdt: number | null;
      }
    | null;
  const fundingAPR = toFundingAPR(funding.rawFundingRate, funding.intervalHours);
  const borrowAPR = b?.borrowAPR ?? null;
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
    tradingFees,
    netAPR,
    spread: toSpreadPercent(funding.futuresPrice, spotPrice),
    futuresPrice: funding.futuresPrice,
    spotPrice,
    borrowLiquidityToken: b?.borrowLiquidityToken ?? null,
    borrowLiquidityUsdt: b?.borrowLiquidityUsdt ?? null,
    nextFundingTime: funding.nextFundingTime,
    updatedAt: funding.updatedAt,
  };
}

async function buildScan(selectedExchanges: Set<string> | null): Promise<ScanApiResponse> {
  const errors: string[] = [];
  const marginPairs = await fetchGateMarginPairs();
  const universeTokens = new Set(
    marginPairs.filter((pair) => pair.endsWith("_USDT")).map((pair) => pair.split("_")[0].toUpperCase())
  );

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
  const [borrowResult, spotResult] = await Promise.allSettled([
    fetchGateBorrowInfo(relevantTokens),
    fetchGateSpotMap(),
  ]);
  const borrowMap =
    borrowResult.status === "fulfilled" ? borrowResult.value : new Map<string, never>();
  const spotMap = spotResult.status === "fulfilled" ? spotResult.value : new Map<string, number>();
  if (borrowResult.status === "rejected") {
    errors.push(
      `GateBorrow: ${borrowResult.reason instanceof Error ? borrowResult.reason.message : "unknown error"}`
    );
  }
  if (spotResult.status === "rejected") {
    errors.push(
      `GateSpot: ${spotResult.reason instanceof Error ? spotResult.reason.message : "unknown error"}`
    );
  }

  const rows = fundingRows.map((funding) =>
    createRow(funding, borrowMap.get(funding.token), spotMap.get(`${funding.token}_USDT`) ?? null)
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

  if (isFresh()) {
    return NextResponse.json(lastGoodResponse);
  }

  if (lastGoodResponse) {
    if (!coldBuildInFlight) {
      coldBuildInFlight = buildScan(selectedExchanges)
        .then((next) => {
          lastGoodResponse = next;
          lastGoodAt = Date.now();
          return next;
        })
        .finally(() => {
          coldBuildInFlight = null;
        });
    }
    return NextResponse.json(lastGoodResponse);
  }

  if (!coldBuildInFlight) {
    coldBuildInFlight = buildScan(selectedExchanges)
      .then((next) => {
        lastGoodResponse = next;
        lastGoodAt = Date.now();
        return next;
      })
      .finally(() => {
        coldBuildInFlight = null;
      });
  }

  try {
    const payload = await coldBuildInFlight;
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
