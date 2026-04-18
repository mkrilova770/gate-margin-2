import { fetchMarginBorrowAprHistory } from "@/lib/gateMarginBorrowHistory";
import { NextResponse } from "next/server";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { expiresAt: number; payload: GateBorrowAprPayload };

const borrowAprCache = new Map<string, CacheEntry>();

export interface GateBorrowAprPayload {
  entries: Array<{ time: string; borrowAprPercent: number }>;
  days: number;
  error: string | null;
  historyAvailable: boolean;
  disclaimer: string | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenRaw = (url.searchParams.get("token") || "").trim().toUpperCase();
  const daysRaw = (url.searchParams.get("days") || "14").trim();
  const daysParsed = Number(daysRaw);
  const days = Number.isFinite(daysParsed) && daysParsed > 0 && daysParsed <= 30 ? Math.floor(daysParsed) : 14;

  if (!tokenRaw) {
    return NextResponse.json({
      entries: [],
      days,
      error: "token is required",
      historyAvailable: false,
      disclaimer: null,
    } satisfies GateBorrowAprPayload, { status: 400 });
  }

  const cacheKey = `${tokenRaw}:${days}`;
  const cached = borrowAprCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  try {
    const { entries, historyAvailable, disclaimer } = await fetchMarginBorrowAprHistory(tokenRaw, days);
    const payload: GateBorrowAprPayload = {
      entries,
      days,
      error: null,
      historyAvailable,
      disclaimer: disclaimer || null,
    };
    borrowAprCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to fetch margin borrow history";
    return NextResponse.json(
      {
        entries: [],
        days,
        error: message,
        historyAvailable: false,
        disclaimer: null,
      } satisfies GateBorrowAprPayload,
      { status: 200 }
    );
  }
}
