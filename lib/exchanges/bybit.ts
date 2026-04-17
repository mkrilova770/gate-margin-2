import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface BybitResponse {
  result?: {
    list?: Array<{
      symbol: string;
      fundingRate?: string;
      markPrice?: string;
      nextFundingTime?: string;
      fundingIntervalHour?: string;
    }>;
  };
}

export async function fetchBybitFunding(): Promise<FundingInfo[]> {
  const payload = await fetchJson<BybitResponse>(
    "https://api.bybit.com/v5/market/tickers?category=linear"
  );
  const updatedAt = new Date().toISOString();
  return (payload.result?.list ?? [])
    .filter((row) => row.symbol?.endsWith("USDT"))
    .map((row) => {
      const token = row.symbol.replace(/USDT$/, "");
      const interval = Number(row.fundingIntervalHour);
      return {
        exchange: "Bybit" as const,
        token: token.toUpperCase(),
        symbol: `${token.toUpperCase()}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.fundingRate)) ? Number(row.fundingRate) : null,
        intervalHours: Number.isFinite(interval) && interval > 0 ? interval : 8,
        futuresPrice: Number.isFinite(Number(row.markPrice)) ? Number(row.markPrice) : null,
        nextFundingTime: row.nextFundingTime ? new Date(Number(row.nextFundingTime)).toISOString() : null,
        updatedAt,
      };
    });
}
