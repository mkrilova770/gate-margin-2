import { fetchBinanceFunding } from "@/lib/exchanges/binance";
import { fetchBingxFunding } from "@/lib/exchanges/bingx";
import { fetchBitgetFunding } from "@/lib/exchanges/bitget";
import { fetchBitmartFunding } from "@/lib/exchanges/bitmart";
import { fetchBybitFunding } from "@/lib/exchanges/bybit";
import { fetchGateFunding } from "@/lib/exchanges/gate";
import { fetchKucoinFunding } from "@/lib/exchanges/kucoin";
import { fetchMexcFunding } from "@/lib/exchanges/mexc";
import { fetchOkxFunding } from "@/lib/exchanges/okx";
import { fetchXtFunding } from "@/lib/exchanges/xt";
import type { ExchangeId, FundingInfo } from "@/types";

export interface FundingAdapter {
  id: ExchangeId;
  fetchFunding: () => Promise<FundingInfo[]>;
}

export const adapters: FundingAdapter[] = [
  { id: "Binance", fetchFunding: fetchBinanceFunding },
  { id: "OKX", fetchFunding: fetchOkxFunding },
  { id: "Bybit", fetchFunding: fetchBybitFunding },
  { id: "Gate", fetchFunding: fetchGateFunding },
  { id: "Bitget", fetchFunding: fetchBitgetFunding },
  { id: "BingX", fetchFunding: fetchBingxFunding },
  { id: "XT", fetchFunding: fetchXtFunding },
  { id: "MEXC", fetchFunding: fetchMexcFunding },
  { id: "BitMart", fetchFunding: fetchBitmartFunding },
  { id: "KuCoin", fetchFunding: fetchKucoinFunding },
];
