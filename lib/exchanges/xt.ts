import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface XtSymbolsResponse {
  result?: Array<{ symbol: string }>;
}

interface XtFundingResponse {
  result?: {
    fundingRate?: string;
    nextCollectionTime?: number;
    collectionInternal?: number;
  };
}

export async function fetchXtFunding(): Promise<FundingInfo[]> {
  const symbols = await fetchJson<XtSymbolsResponse>(
    "https://fapi.xt.com/future/market/v1/public/symbol/list"
  );
  const list = (symbols.result ?? []).filter((row) => row.symbol.endsWith("_usdt")).slice(0, 120);
  const updatedAt = new Date().toISOString();

  const funding = await Promise.all(
    list.map(async (row) => {
      try {
        const payload = await fetchJson<XtFundingResponse>(
          `https://fapi.xt.com/future/market/v1/public/q/funding-rate?symbol=${encodeURIComponent(row.symbol)}`
        );
        return { symbol: row.symbol, data: payload.result ?? null };
      } catch {
        return { symbol: row.symbol, data: null };
      }
    })
  );

  return funding
    .filter((row) => row.data)
    .map((row) => {
      const token = row.symbol.replace(/_usdt$/, "").toUpperCase();
      const collectionInternal = Number(row.data?.collectionInternal);
      const intervalHours =
        Number.isFinite(collectionInternal) && collectionInternal > 0
          ? collectionInternal <= 24
            ? collectionInternal
            : collectionInternal / 3600
          : 8;
      return {
        exchange: "XT" as const,
        token,
        symbol: `${token}_USDT`,
        rawFundingRate: Number.isFinite(Number(row.data?.fundingRate)) ? Number(row.data?.fundingRate) : null,
        intervalHours,
        futuresPrice: null,
        nextFundingTime: row.data?.nextCollectionTime
          ? new Date(Number(row.data.nextCollectionTime)).toISOString()
          : null,
        updatedAt,
      };
    });
}
