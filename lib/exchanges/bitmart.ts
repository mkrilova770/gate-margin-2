import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface BitmartResponse {
  data?: {
    symbols?: Array<{
      symbol: string;
      funding_rate?: string;
      last_price?: string;
      index_price?: string;
      funding_time?: number;
      funding_interval_hours?: number | string;
    }>;
  };
}

export async function fetchBitmartFunding(): Promise<FundingInfo[]> {
  const payload = await fetchJson<BitmartResponse>(
    "https://api-cloud-v2.bitmart.com/contract/public/details"
  );
  const updatedAt = new Date().toISOString();
  return (payload.data?.symbols ?? [])
    .filter((row) => row.symbol.endsWith("USDT"))
    .map((row) => {
      const token = row.symbol.replace(/USDT$/, "").replace(/_$/, "").toUpperCase();
      const interval = Number(row.funding_interval_hours);
      return {
        exchange: "BitMart" as const,
        token,
        symbol: `${token}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.funding_rate)) ? Number(row.funding_rate) : null,
        intervalHours: Number.isFinite(interval) && interval > 0 ? interval : 8,
        futuresPrice: Number.isFinite(Number(row.last_price))
          ? Number(row.last_price)
          : Number.isFinite(Number(row.index_price))
            ? Number(row.index_price)
            : null,
        nextFundingTime: row.funding_time ? new Date(row.funding_time).toISOString() : null,
        updatedAt,
      };
    });
}
