export type ExchangeId =
  | "Binance"
  | "OKX"
  | "Bybit"
  | "Gate"
  | "Bitget"
  | "BingX"
  | "XT"
  | "MEXC"
  | "BitMart"
  | "KuCoin";

export interface FundingInfo {
  exchange: ExchangeId;
  token: string;
  symbol: string;
  rawFundingRate: number | null;
  intervalHours: number;
  futuresPrice: number | null;
  nextFundingTime: string | null;
  updatedAt: string;
}

export interface GateBorrowRow {
  token: string;
  currencyPair: string;
  borrowAPR: number | null;
  borrowLiquidityToken: number | null;
  borrowLiquidityUsdt: number | null;
}

export interface ArbitrageRow {
  id: string;
  token: string;
  exchange: ExchangeId;
  rawFunding: number | null;
  intervalHours: number;
  fundingAPR: number | null;
  borrowAPR: number | null;
  tradingFees: number;
  netAPR: number | null;
  spread: number | null;
  futuresPrice: number | null;
  spotPrice: number | null;
  borrowLiquidityToken: number | null;
  borrowLiquidityUsdt: number | null;
  nextFundingTime: string | null;
  updatedAt: string;
}

export interface ScanApiResponse {
  rows: ArbitrageRow[];
  fetchedAt: string;
  errors: string[];
}

export interface FundingHistoryEntry {
  time: string;
  rawFundingRate: number;
}
