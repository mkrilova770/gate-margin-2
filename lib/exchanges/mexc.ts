import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface MexcResponse {
  data?: Array<{
    symbol: string;
    fundingRate?: string;
    fairPrice?: string;
    lastPrice?: string;
    collectCycle?: number | string;
    nextSettleTime?: number;
  }>;
}

export async function fetchMexcFunding(): Promise<FundingInfo[]> {
  const payload = await fetchJson<MexcResponse>("https://contract.mexc.com/api/v1/contract/ticker");
  const updatedAt = new Date().toISOString();
  return (payload.data ?? [])
    .filter((row) => row.symbol.endsWith("_USDT"))
    .map((row) => {
      const token = row.symbol.replace(/_USDT$/, "").toUpperCase();
      const cycle = Number(row.collectCycle);
      return {
        exchange: "MEXC" as const,
        token,
        symbol: `${token}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.fundingRate)) ? Number(row.fundingRate) : null,
        intervalHours: Number.isFinite(cycle) && cycle > 0 ? cycle / 3600 : 8,
        futuresPrice: Number.isFinite(Number(row.fairPrice))
          ? Number(row.fairPrice)
          : Number.isFinite(Number(row.lastPrice))
            ? Number(row.lastPrice)
            : null,
        nextFundingTime: row.nextSettleTime ? new Date(row.nextSettleTime).toISOString() : null,
        updatedAt,
      };
    });
}
