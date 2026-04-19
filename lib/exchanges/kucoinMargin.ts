import crypto from "node:crypto";
import type { KucoinBorrowRow } from "@/types";

const KUCOIN_API_HOST = "https://api.kucoin.com";
const CACHE_TTL_MS = 60_000;
const RATE_BATCH_SIZE = 20;

function getKucoinCredentials() {
  const key = process.env.KUCOIN_API_KEY ?? "";
  const secret = process.env.KUCOIN_API_SECRET ?? "";
  const passphrase = process.env.KUCOIN_API_PASSPHRASE ?? "";
  if (!key || !secret || !passphrase) return null;
  return { key, secret, passphrase };
}

function signRequest(
  secret: string,
  passphrase: string,
  timestamp: string,
  method: string,
  endpoint: string,
  body: string,
): { sign: string; encPassphrase: string } {
  const strToSign = timestamp + method + endpoint + body;
  const sign = crypto
    .createHmac("sha256", secret)
    .update(strToSign)
    .digest("base64");
  const encPassphrase = crypto
    .createHmac("sha256", secret)
    .update(passphrase)
    .digest("base64");
  return { sign, encPassphrase };
}

async function kucoinGet<T>(path: string): Promise<T> {
  const creds = getKucoinCredentials();
  if (!creds) throw new Error("KuCoin API keys not configured");

  const timestamp = String(Date.now());
  const { sign, encPassphrase } = signRequest(
    creds.secret,
    creds.passphrase,
    timestamp,
    "GET",
    path,
    "",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${KUCOIN_API_HOST}${path}`, {
      method: "GET",
      headers: {
        "KC-API-KEY": creds.key,
        "KC-API-SIGN": sign,
        "KC-API-TIMESTAMP": timestamp,
        "KC-API-PASSPHRASE": encPassphrase,
        "KC-API-KEY-VERSION": "2",
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`KuCoin API ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { code?: string; data?: T; msg?: string };
    if (json.code !== "200000") {
      throw new Error(`KuCoin API error ${json.code}: ${json.msg ?? "unknown"}`);
    }
    return json.data as T;
  } finally {
    clearTimeout(timer);
  }
}

interface KucoinIsolatedRiskRow {
  symbol: string;
  baseMaxBorrowAmount: string;
  baseBorrowEnabled: boolean;
}

interface KucoinBorrowRateData {
  vipLevel: number;
  items: Array<{
    currency: string;
    hourlyBorrowRate: string;
    annualizedBorrowRate: string;
  }>;
}

interface KucoinInventoryRow {
  currency: string;
  borrowableAmount: string;
}

async function fetchAvailableInventory(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${KUCOIN_API_HOST}/api/v3/margin/available-inventory`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return map;
      const json = (await res.json()) as { code?: string; data?: KucoinInventoryRow[] };
      if (json.code !== "200000" || !Array.isArray(json.data)) return map;
      for (const row of json.data) {
        const val = parseFloat(row.borrowableAmount);
        if (Number.isFinite(val)) {
          map.set(row.currency.toUpperCase(), val);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // non-critical
  }
  return map;
}

let dataCache: { expiresAt: number; value: Map<string, KucoinBorrowRow> } | null = null;

export async function fetchKucoinMarginData(): Promise<Map<string, KucoinBorrowRow>> {
  if (dataCache && dataCache.expiresAt > Date.now()) {
    return dataCache.value;
  }

  const [isoRows, inventoryMap] = await Promise.all([
    kucoinGet<KucoinIsolatedRiskRow[]>("/api/v3/margin/currencies?isIsolated=true"),
    fetchAvailableInventory(),
  ]);

  const enabledTokens = new Set<string>();
  for (const row of isoRows) {
    if (!row.baseBorrowEnabled) continue;
    enabledTokens.add(row.symbol.split("-")[0].toUpperCase());
  }

  if (enabledTokens.size === 0) {
    const empty = new Map<string, KucoinBorrowRow>();
    dataCache = { value: empty, expiresAt: Date.now() + CACHE_TTL_MS };
    return empty;
  }

  const rateMap = new Map<string, { annualizedBorrowRate: number; hourlyBorrowRate: number }>();
  const currencyNames = [...enabledTokens];

  for (let i = 0; i < currencyNames.length; i += RATE_BATCH_SIZE) {
    const batch = currencyNames.slice(i, i + RATE_BATCH_SIZE);
    const currencyParam = batch.join(",");
    try {
      const rateData = await kucoinGet<KucoinBorrowRateData>(
        `/api/v3/margin/borrowRate?currency=${currencyParam}`,
      );
      for (const item of rateData.items) {
        const annual = parseFloat(item.annualizedBorrowRate);
        const hourly = parseFloat(item.hourlyBorrowRate);
        if (Number.isFinite(annual)) {
          rateMap.set(item.currency.toUpperCase(), {
            annualizedBorrowRate: annual,
            hourlyBorrowRate: Number.isFinite(hourly) ? hourly : 0,
          });
        }
      }
    } catch {
      // partial failure is ok
    }
  }

  const map = new Map<string, KucoinBorrowRow>();
  for (const token of enabledTokens) {
    const rate = rateMap.get(token);
    const borrowAPR = rate ? rate.annualizedBorrowRate * 100 : null;
    const borrowable = inventoryMap.get(token) ?? null;

    map.set(token, {
      token,
      borrowAPR,
      maxBorrow: borrowable,
      estimatedUsdt: null,
    });
  }

  dataCache = { value: map, expiresAt: Date.now() + CACHE_TTL_MS };

  const now = Date.now();
  for (const [token, row] of map) {
    if (row.borrowAPR == null) continue;
    let arr = aprHistory.get(token);
    if (!arr) { arr = []; aprHistory.set(token, arr); }
    if (arr.length === 0 || now - arr[arr.length - 1].ts >= 50_000) {
      arr.push({ ts: now, apr: row.borrowAPR });
      if (arr.length > MAX_HISTORY_POINTS) arr.splice(0, arr.length - MAX_HISTORY_POINTS);
    }
  }

  return map;
}

const MAX_HISTORY_POINTS = 350;
const aprHistory = new Map<string, Array<{ ts: number; apr: number }>>();

export function getKucoinAprHistory(
  token: string,
  days: number,
): Array<{ time: string; borrowAprPercent: number }> {
  const t = token.toUpperCase();
  const arr = aprHistory.get(t);
  if (!arr || arr.length === 0) return [];
  const from = Date.now() - days * 86_400_000;
  return arr
    .filter((p) => p.ts >= from)
    .map((p) => ({ time: new Date(p.ts).toISOString(), borrowAprPercent: p.apr }));
}

export async function fetchKucoinMarginPairs(): Promise<Set<string>> {
  const map = await fetchKucoinMarginData();
  return new Set(map.keys());
}
