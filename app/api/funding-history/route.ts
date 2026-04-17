import { fetchFundingHistory, type FundingHistoryDays } from "@/lib/exchanges/fundingHistory";
import type { ExchangeId } from "@/types";
import { NextResponse } from "next/server";

const SUPPORTED_EXCHANGES: ExchangeId[] = [
  "Binance",
  "OKX",
  "Bybit",
  "Gate",
  "Bitget",
  "BingX",
  "XT",
  "MEXC",
  "BitMart",
  "KuCoin",
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const exchangeRaw = (url.searchParams.get("exchange") || "").trim();
  const tokenRaw = (url.searchParams.get("token") || "").trim();
  const daysRaw = (url.searchParams.get("days") || "14").trim();
  const daysParsed = Number(daysRaw);
  const days: FundingHistoryDays = daysParsed === 14 ? 14 : 7;

  if (!exchangeRaw || !tokenRaw) {
    return NextResponse.json({ entries: [], error: "exchange and token are required" }, { status: 400 });
  }

  if (!SUPPORTED_EXCHANGES.includes(exchangeRaw as ExchangeId)) {
    return NextResponse.json({ entries: [], error: "unknown exchange" }, { status: 400 });
  }

  try {
    const entries = await fetchFundingHistory(exchangeRaw as ExchangeId, tokenRaw.toUpperCase(), days);
    return NextResponse.json({ entries, days, error: null });
  } catch (error) {
    return NextResponse.json(
      { entries: [], error: error instanceof Error ? error.message : "failed to fetch funding history" },
      { status: 200 }
    );
  }
}
