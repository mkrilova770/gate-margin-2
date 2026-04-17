import { fetchJson } from "@/lib/http";
import type { FundingInfo, GateBorrowRow } from "@/types";

const GATE_API_HOST = "https://api.gateio.ws";
const GATE_WEB_HOSTS = ["https://www.gate.com", "https://www.gate.io"] as const;

let marginPairsCache: { expiresAt: number; value: string[] } | null = null;
let spotMapCache: { expiresAt: number; value: Map<string, number> } | null = null;
let borrowRowsCache: { expiresAt: number; value: GateBorrowRow[] } | null = null;

export async function fetchGateMarginPairs(): Promise<string[]> {
  if (marginPairsCache && marginPairsCache.expiresAt > Date.now()) {
    return marginPairsCache.value;
  }
  const rows = await fetchJson<Array<{ id: string; trade_status?: string; quote?: string }>>(
    `${GATE_API_HOST}/api/v4/margin/currency_pairs`
  );
  const pairs = rows
    .filter((row) => row.quote === "USDT" && (row.trade_status ?? "tradable") === "tradable")
    .map((row) => row.id.toUpperCase());
  marginPairsCache = { value: pairs, expiresAt: Date.now() + 60_000 };
  return pairs;
}

export async function fetchGateSpotMap(): Promise<Map<string, number>> {
  if (spotMapCache && spotMapCache.expiresAt > Date.now()) {
    return spotMapCache.value;
  }
  const tickers = await fetchJson<Array<{ currency_pair: string; last: string }>>(
    `${GATE_API_HOST}/api/v4/spot/tickers`
  );
  const map = new Map<string, number>();
  for (const row of tickers) {
    const value = Number(row.last);
    if (Number.isFinite(value)) {
      map.set(String(row.currency_pair).toUpperCase(), value);
    }
  }
  spotMapCache = { value: map, expiresAt: Date.now() + 20_000 };
  return map;
}

interface GateWebBorrowResponse {
  code?: number;
  data?: {
    list?: Array<{
      market: string;
      stock_total_lend_available?: string;
      stock_total_lend_available_fiat?: string;
      stock_last_time_loan_rate_year?: string;
    }>;
    vip_settings?: Array<{ vip_level?: number | string; borrow_up_rate?: number | string }>;
  };
  message?: string;
}

async function fetchGateWebBorrowRowsRaw(): Promise<GateWebBorrowResponse> {
  const params = new URLSearchParams({
    sub_website_id: "0",
    page: "1",
    limit: "1000",
    search_coin: "",
  });
  let lastStatus = 0;
  for (const host of GATE_WEB_HOSTS) {
    const response = await fetch(`${host}/apiw/v2/spot_loan/margin/margin_loan_info?${params}`, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${host}/`,
        Origin: host,
      },
      cache: "no-store",
    });

    if (response.ok) {
      return (await response.json()) as GateWebBorrowResponse;
    }
    lastStatus = response.status;
  }
  throw new Error(`Gate web borrow request failed (${lastStatus || "unknown"})`);
}

// IMPORTANT: This keeps the existing logic unchanged for available borrow and borrow APR.
export async function fetchGateBorrowInfo(tokens: string[]): Promise<Map<string, GateBorrowRow>> {
  if (borrowRowsCache && borrowRowsCache.expiresAt > Date.now()) {
    return buildBorrowMap(borrowRowsCache.value, tokens);
  }

  const payload = await fetchGateWebBorrowRowsRaw();
  if (payload.code !== 200 || !Array.isArray(payload.data?.list)) {
    throw new Error(payload.message || "Gate web borrow payload is invalid");
  }

  const vip0 = (payload.data?.vip_settings ?? []).find((v) => Number(v.vip_level) === 0);
  const vip0BorrowUpRate = Number(vip0?.borrow_up_rate);

  const rows: GateBorrowRow[] = payload.data.list.map((item) => {
    const pair = String(item.market || "").toUpperCase();
    const token = pair.split("_")[0] ?? "";

    const stockLastTimeLoanRateYear = Number(item.stock_last_time_loan_rate_year);
    let borrowAPR: number | null = null;
    if (Number.isFinite(stockLastTimeLoanRateYear)) {
      const adjusted = Number.isFinite(vip0BorrowUpRate)
        ? stockLastTimeLoanRateYear * vip0BorrowUpRate
        : stockLastTimeLoanRateYear;
      borrowAPR = adjusted * 100;
    }

    const borrowLiquidityToken = Number(item.stock_total_lend_available);
    const borrowLiquidityUsdt = Number(item.stock_total_lend_available_fiat);

    return {
      token,
      currencyPair: pair,
      borrowAPR,
      borrowLiquidityToken: Number.isFinite(borrowLiquidityToken) ? borrowLiquidityToken : null,
      borrowLiquidityUsdt: Number.isFinite(borrowLiquidityUsdt) ? borrowLiquidityUsdt : null,
    };
  });

  borrowRowsCache = { value: rows, expiresAt: Date.now() + 20_000 };
  return buildBorrowMap(rows, tokens);
}

function buildBorrowMap(rows: GateBorrowRow[], tokens: string[]): Map<string, GateBorrowRow> {
  const wanted = new Set(tokens.map((token) => token.toUpperCase()));
  const result = new Map<string, GateBorrowRow>();
  for (const row of rows) {
    if (wanted.size === 0 || wanted.has(row.token)) {
      result.set(row.token, row);
    }
  }
  return result;
}

export async function fetchGateFunding(): Promise<FundingInfo[]> {
  const contracts = await fetchJson<
    Array<{
      name: string;
      funding_rate?: string;
      mark_price?: string;
      funding_next_apply?: number;
      funding_interval?: number;
    }>
  >(`${GATE_API_HOST}/api/v4/futures/usdt/contracts`);

  const updatedAt = new Date().toISOString();
  return contracts
    .filter((item) => item.name?.endsWith("_USDT"))
    .map((item) => ({
      exchange: "Gate" as const,
      token: item.name.split("_")[0].toUpperCase(),
      symbol: item.name.toUpperCase(),
      rawFundingRate: Number.isFinite(Number(item.funding_rate)) ? Number(item.funding_rate) : null,
      intervalHours: Number.isFinite(Number(item.funding_interval))
        ? Number(item.funding_interval) / 3600
        : 8,
      futuresPrice: Number.isFinite(Number(item.mark_price)) ? Number(item.mark_price) : null,
      nextFundingTime: item.funding_next_apply ? new Date(item.funding_next_apply * 1000).toISOString() : null,
      updatedAt,
    }));
}
