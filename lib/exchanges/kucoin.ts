import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface KucoinResponse {
  data?: Array<{
    symbol: string;
    fundingFeeRate?: string;
    markPrice?: string;
    nextFundingRateDateTime?: number;
    fundingRateGranularity?: number;
  }>;
}

function normalizeToken(token: string): string {
  return token === "XBT" ? "BTC" : token;
}

export async function fetchKucoinFunding(): Promise<FundingInfo[]> {
  const payload = await fetchJson<KucoinResponse>("https://api-futures.kucoin.com/api/v1/contracts/active");
  const updatedAt = new Date().toISOString();
  return (payload.data ?? [])
    .filter((row) => row.symbol.endsWith("USDTM"))
    .map((row) => {
      const rawToken = row.symbol.replace(/USDTM$/, "");
      const token = normalizeToken(rawToken.toUpperCase());
      return {
        exchange: "KuCoin" as const,
        token,
        symbol: `${token}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.fundingFeeRate)) ? Number(row.fundingFeeRate) : null,
        intervalHours: Number.isFinite(Number(row.fundingRateGranularity))
          ? Number(row.fundingRateGranularity) / 3_600_000
          : 8,
        futuresPrice: Number.isFinite(Number(row.markPrice)) ? Number(row.markPrice) : null,
        nextFundingTime: row.nextFundingRateDateTime
          ? new Date(row.nextFundingRateDateTime).toISOString()
          : null,
        updatedAt,
      };
    });
}
