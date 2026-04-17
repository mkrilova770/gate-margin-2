import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

export async function fetchBinanceFunding(): Promise<FundingInfo[]> {
  const payload = await fetchJson<
    Array<{ symbol: string; lastFundingRate?: string; markPrice?: string; nextFundingTime?: number }>
  >("https://fapi.binance.com/fapi/v1/premiumIndex");
  const updatedAt = new Date().toISOString();
  return payload
    .filter((row) => row.symbol?.endsWith("USDT"))
    .map((row) => {
      const token = row.symbol.replace(/USDT$/, "");
      return {
        exchange: "Binance" as const,
        token: token.toUpperCase(),
        symbol: `${token.toUpperCase()}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.lastFundingRate)) ? Number(row.lastFundingRate) : null,
        intervalHours: 8,
        futuresPrice: Number.isFinite(Number(row.markPrice)) ? Number(row.markPrice) : null,
        nextFundingTime: row.nextFundingTime ? new Date(row.nextFundingTime).toISOString() : null,
        updatedAt,
      };
    });
}
