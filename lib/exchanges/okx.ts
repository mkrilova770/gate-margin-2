import { fetchJson } from "@/lib/http";
import type { FundingInfo } from "@/types";

interface OkxWrap<T> {
  data?: T[];
}

export async function fetchOkxFunding(): Promise<FundingInfo[]> {
  const instruments = await fetchJson<OkxWrap<{ instId: string }>>(
    "https://www.okx.com/api/v5/public/instruments?instType=SWAP"
  );
  const markPrices = await fetchJson<OkxWrap<{ instId: string; markPx?: string }>>(
    "https://www.okx.com/api/v5/public/mark-price?instType=SWAP"
  );
  const markMap = new Map((markPrices.data ?? []).map((row) => [row.instId, Number(row.markPx)]));
  const updatedAt = new Date().toISOString();

  const selected = (instruments.data ?? []).filter((row) => row.instId.endsWith("-USDT-SWAP")).slice(0, 150);
  const fundingRows = await Promise.all(
    selected.map(async (row) => {
      try {
        const fund = await fetchJson<
          OkxWrap<{ fundingRate?: string; nextFundingTime?: string; fundingTime?: string }>
        >(`https://www.okx.com/api/v5/public/funding-rate?instId=${encodeURIComponent(row.instId)}`);
        return { instId: row.instId, payload: fund.data?.[0] ?? null };
      } catch {
        return { instId: row.instId, payload: null };
      }
    })
  );

  return fundingRows
    .filter((row) => row.payload)
    .map((row) => {
      const token = row.instId.split("-")[0].toUpperCase();
      const nextFundingTime = row.payload?.nextFundingTime ? Number(row.payload.nextFundingTime) : NaN;
      const now = Date.now();
      const diff = Number.isFinite(nextFundingTime) ? Math.max(1, nextFundingTime - now) : 8 * 3600_000;
      const intervalHours = diff <= 1.5 * 3600_000 ? 1 : diff <= 4.5 * 3600_000 ? 4 : 8;
      return {
        exchange: "OKX" as const,
        token,
        symbol: `${token}_USDT`,
        rawFundingRate:
          Number.isFinite(Number(row.payload?.fundingRate)) ? Number(row.payload?.fundingRate) : null,
        intervalHours,
        futuresPrice: Number.isFinite(markMap.get(row.instId)) ? markMap.get(row.instId)! : null,
        nextFundingTime: Number.isFinite(nextFundingTime) ? new Date(nextFundingTime).toISOString() : null,
        updatedAt,
      };
    });
}
