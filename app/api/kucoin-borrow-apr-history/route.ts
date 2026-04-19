import { fetchKucoinMarginData, getKucoinAprHistory } from "@/lib/exchanges/kucoinMargin";
import { NextResponse } from "next/server";

const KUCOIN_API_HOST = "https://api.kucoin.com";

interface MarketRateRow {
  time: string;
  marketInterestRate: string;
}

async function fetchLendingMarketHistory(
  currency: string,
): Promise<Array<{ ts: number; rate: number }>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(
        `${KUCOIN_API_HOST}/api/v3/project/marketInterestRate?currency=${currency}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!res.ok) return [];
      const json = (await res.json()) as { code?: string; data?: MarketRateRow[] };
      if (json.code !== "200000" || !Array.isArray(json.data)) return [];

      const result: Array<{ ts: number; rate: number }> = [];
      for (const row of json.data) {
        const rate = parseFloat(row.marketInterestRate);
        if (!Number.isFinite(rate)) continue;
        const y = parseInt(row.time.slice(0, 4), 10);
        const mo = parseInt(row.time.slice(4, 6), 10) - 1;
        const d = parseInt(row.time.slice(6, 8), 10);
        const h = parseInt(row.time.slice(8, 10), 10);
        const m = parseInt(row.time.slice(10, 12), 10);
        const ts = new Date(y, mo, d, h, m).getTime();
        if (Number.isFinite(ts)) result.push({ ts, rate });
      }
      return result.sort((a, b) => a.ts - b.ts);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}

const historyCache = new Map<string, { expiresAt: number; payload: ReturnType<typeof buildResponse> extends Promise<infer T> ? T : never }>();

function buildHistoryEntries(
  lendingData: Array<{ ts: number; rate: number }>,
  currentApr: number,
): Array<{ time: string; borrowAprPercent: number }> | null {
  const nonZero = lendingData.filter((p) => p.rate > 0);
  if (nonZero.length < 6) return null;

  const latest = nonZero[nonZero.length - 1];
  const scale = latest.rate > 1e-12 ? currentApr / latest.rate : 1;

  return nonZero.map((p) => ({
    time: new Date(p.ts).toISOString(),
    borrowAprPercent: p.rate * scale,
  }));
}

async function buildResponse(tokenRaw: string, days: number) {
  const map = await fetchKucoinMarginData();
  const currentRow = map.get(tokenRaw);
  const currentApr = currentRow?.borrowAPR ?? null;

  if (currentApr == null) {
    return { entries: [] as Array<{ time: string; borrowAprPercent: number }>, days, error: null, disclaimer: null };
  }

  const accumulated = getKucoinAprHistory(tokenRaw, days);
  if (accumulated.length >= 48) {
    return { entries: accumulated, days, error: null, disclaimer: null };
  }

  const lending = await fetchLendingMarketHistory(tokenRaw);
  const scaled = buildHistoryEntries(lending, currentApr);

  if (scaled && scaled.length >= 6) {
    return {
      entries: scaled,
      days,
      error: null,
      disclaimer:
        "Данные: KuCoin lending market (marketInterestRate), масштаб подогнан к текущей маржинальной ставке. Глубина — до 7 дней.",
    };
  }

  const MS_HOUR = 3_600_000;
  const now = Date.now();
  const from = now - days * 24 * MS_HOUR;
  const flat = Array.from({ length: days * 24 + 1 }, (_, i) => ({
    time: new Date(from + i * MS_HOUR).toISOString(),
    borrowAprPercent: currentApr,
  }));

  return {
    entries: flat,
    days,
    error: null,
    disclaimer:
      "Для этого токена нет публичной истории ставок KuCoin. Показана текущая маржинальная ставка.",
  };
}

const CACHE_TTL_MS = 10 * 60_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenRaw = (url.searchParams.get("token") || "").trim().toUpperCase();
  const daysRaw = (url.searchParams.get("days") || "14").trim();
  const daysParsed = Number(daysRaw);
  const days = Number.isFinite(daysParsed) && daysParsed > 0 && daysParsed <= 30 ? Math.floor(daysParsed) : 14;

  if (!tokenRaw) {
    return NextResponse.json({ entries: [], days, error: "token is required", disclaimer: null }, { status: 400 });
  }

  const cacheKey = `${tokenRaw}:${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  try {
    const payload = await buildResponse(tokenRaw, days);
    historyCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      entries: [],
      days,
      error: error instanceof Error ? error.message : "failed to fetch KuCoin borrow data",
      disclaimer: null,
    });
  }
}
