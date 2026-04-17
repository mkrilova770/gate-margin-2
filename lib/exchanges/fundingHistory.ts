import { fetchJson } from "@/lib/http";
import type { ExchangeId, FundingHistoryEntry } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function normalize(entries: FundingHistoryEntry[]): FundingHistoryEntry[] {
  return entries
    .filter((entry) => Number.isFinite(entry.rawFundingRate) && !Number.isNaN(new Date(entry.time).getTime()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function kucoinSymbolFromToken(token: string): string {
  const t = token.toUpperCase();
  return t === "BTC" ? "XBTUSDTM" : `${t}USDTM`;
}

export type FundingHistoryDays = 7 | 14;

export async function fetchFundingHistory(
  exchange: ExchangeId,
  token: string,
  days: FundingHistoryDays = 7
): Promise<FundingHistoryEntry[]> {
  const t = token.toUpperCase();
  const now = Date.now();
  const windowMs = days * DAY_MS;
  const from = now - windowMs;

  const withinWindow = (timeMs: number) => timeMs >= from;

  switch (exchange) {
    case "Binance": {
      const payload = await fetchJson<Array<{ fundingRate: string; fundingTime: number }>>(
        `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${t}USDT&startTime=${from}&endTime=${now}&limit=1000`
      );
      return normalize(
        payload
          .filter((row) => withinWindow(row.fundingTime))
          .map((row) => ({ time: new Date(row.fundingTime).toISOString(), rawFundingRate: Number(row.fundingRate) }))
      );
    }
    case "Bybit": {
      const payload = await fetchJson<{
        result?: { list?: Array<{ fundingRate: string; fundingRateTimestamp: string }> };
      }>(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${t}USDT&limit=200`);
      return normalize(
        (payload.result?.list ?? [])
          .map((row) => ({ at: Number(row.fundingRateTimestamp), rate: Number(row.fundingRate) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "OKX": {
      const payload = await fetchJson<{ data?: Array<{ fundingRate: string; fundingTime: string }> }>(
        `https://www.okx.com/api/v5/public/funding-rate-history?instId=${t}-USDT-SWAP&limit=100`
      );
      return normalize(
        (payload.data ?? [])
          .map((row) => ({ at: Number(row.fundingTime), rate: Number(row.fundingRate) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "Gate": {
      const fromSec = Math.floor(from / 1000);
      const toSec = Math.floor(now / 1000);
      const payload = await fetchJson<Array<{ t: number; r: string }>>(
        `https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=${t}_USDT&from=${fromSec}&to=${toSec}&limit=1000`
      );
      return normalize(
        payload
          .map((row) => ({ at: Number(row.t) * 1000, rate: Number(row.r) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "Bitget": {
      const payload = await fetchJson<{ data?: Array<{ fundingRate: string; fundingTime: string }> }>(
        `https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=${t}USDT&productType=USDT-FUTURES&pageNo=1&pageSize=200`
      );
      return normalize(
        (payload.data ?? [])
          .map((row) => ({ at: Number(row.fundingTime), rate: Number(row.fundingRate) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "BingX": {
      const payload = await fetchJson<{
        data?: Array<{ fundingRate: string; fundingTime: number; symbol: string }>;
      }>(`https://open-api.bingx.com/openApi/swap/v2/quote/fundingRate?symbol=${t}-USDT`);
      return normalize(
        (payload.data ?? [])
          .map((row) => ({ at: Number(row.fundingTime), rate: Number(row.fundingRate) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "XT": {
      const payload = await fetchJson<{
        result?: { items?: Array<{ fundingRate: string; createdTime: number | string }> };
      }>(
        `https://fapi.xt.com/future/market/v1/public/q/funding-rate-record?symbol=${t.toLowerCase()}_usdt&page=1&size=500`
      );
      return normalize(
        (payload.result?.items ?? [])
          .map((row) => ({ at: Number(row.createdTime), rate: Number(row.fundingRate) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "KuCoin": {
      const payload = await fetchJson<{
        data?: Array<Record<string, unknown>>;
      }>(
        `https://api-futures.kucoin.com/api/v1/contract/funding-rates?symbol=${kucoinSymbolFromToken(
          t
        )}&from=${from}&to=${now}`
      );
      return normalize(
        (payload.data ?? []).map((row) => {
          const r = row as { timePoint?: number; timepoint?: number; value?: number | string; fundingRate?: number | string };
          return {
            at: Number(r.timePoint ?? r.timepoint),
            rate: Number(r.value ?? r.fundingRate),
          };
        })
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "MEXC": {
      const payload = await fetchJson<{ data?: { resultList?: Array<{ settleTime: number; fundingRate: string }> } }>(
        `https://contract.mexc.com/api/v1/contract/funding_rate/history?symbol=${t}_USDT&page_num=1&page_size=200`
      );
      return normalize(
        (payload.data?.resultList ?? [])
          .map((row) => ({ at: Number(row.settleTime), rate: Number(row.fundingRate) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    case "BitMart": {
      const payload = await fetchJson<{ data?: { list?: Array<{ funding_time: number; funding_rate: string }> } }>(
        `https://api-cloud-v2.bitmart.com/contract/public/funding-rate-history?symbol=${t}USDT`
      );
      return normalize(
        (payload.data?.list ?? [])
          .map((row) => ({ at: Number(row.funding_time), rate: Number(row.funding_rate) }))
          .filter((row) => Number.isFinite(row.at) && withinWindow(row.at))
          .map((row) => ({ time: new Date(row.at).toISOString(), rawFundingRate: row.rate }))
      );
    }
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}
