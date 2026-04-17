import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface BingxResponse {
  data?: Array<{
    symbol: string;
    lastFundingRate?: string;
    markPrice?: string;
    nextFundingTime?: number;
    fundingIntervalHours?: number | string;
  }>;
}

export async function fetchBingxFunding(): Promise<FundingInfo[]> {
  const payload = await fetchJson<BingxResponse>(
    "https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex"
  );
  const updatedAt = new Date().toISOString();
  return (payload.data ?? [])
    .filter((row) => row.symbol?.endsWith("-USDT"))
    .map((row) => {
      const token = row.symbol.replace(/-USDT$/, "").toUpperCase();
      const interval = Number(row.fundingIntervalHours);
      return {
        exchange: "BingX" as const,
        token,
        symbol: `${token}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.lastFundingRate)) ? Number(row.lastFundingRate) : null,
        intervalHours: Number.isFinite(interval) && interval > 0 ? interval : 8,
        futuresPrice: Number.isFinite(Number(row.markPrice)) ? Number(row.markPrice) : null,
        nextFundingTime: row.nextFundingTime ? new Date(row.nextFundingTime).toISOString() : null,
        updatedAt,
      };
    });
}
