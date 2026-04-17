import type { ExchangeId } from "@/types";

const FEES: Record<ExchangeId, number> = {
  Binance: 0.16,
  OKX: 0.16,
  Bybit: 0.16,
  Gate: 0.2,
  Bitget: 0.2,
  BingX: 0.2,
  XT: 0.25,
  MEXC: 0.2,
  BitMart: 0.25,
  KuCoin: 0.2,
};

export function getTradingFeesPercent(exchange: ExchangeId): number {
  return FEES[exchange] ?? 0.2;
}
