import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface BitgetResponse {
  data?: Array<{ symbol: string; fundingRate?: string; markPrice?: string; lastPr?: string }>;
}

function next8hIso(): string {
  const now = new Date();
  const hour = now.getUTCHours();
  const slot = hour < 8 ? 8 : hour < 16 ? 16 : 24;
  const next = new Date(now);
  next.setUTCHours(slot, 0, 0, 0);
  if (slot === 24) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0, 0, 0, 0);
  }
  return next.toISOString();
}

export async function fetchBitgetFunding(): Promise<FundingInfo[]> {
  const payload = await fetchJson<BitgetResponse>(
    "https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES"
  );
  const updatedAt = new Date().toISOString();
  return (payload.data ?? [])
    .filter((row) => row.symbol.endsWith("USDT"))
    .map((row) => {
      const token = row.symbol.replace(/USDT$/, "");
      return {
        exchange: "Bitget" as const,
        token: token.toUpperCase(),
        symbol: `${token.toUpperCase()}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.fundingRate)) ? Number(row.fundingRate) : null,
        intervalHours: 8,
        futuresPrice: Number.isFinite(Number(row.markPrice))
          ? Number(row.markPrice)
          : Number.isFinite(Number(row.lastPr))
            ? Number(row.lastPr)
            : null,
        nextFundingTime: next8hIso(),
        updatedAt,
      };
    });
}
