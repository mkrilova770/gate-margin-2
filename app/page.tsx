"use client";

import { ArbitrageTable } from "@/components/ArbitrageTable";
import { StatusBar } from "@/components/StatusBar";
import { TokenModal } from "@/components/TokenModal";
import { useArbitrageData } from "@/hooks/useArbitrageData";
import type { ArbitrageRow, ExchangeId } from "@/types";
import { useMemo, useState } from "react";

const EXCHANGES: ExchangeId[] = [
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

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>(EXCHANGES);
  const [selectedRow, setSelectedRow] = useState<ArbitrageRow | null>(null);
  const { data, isFetching, refetch, history } = useArbitrageData(selectedExchanges);

  const rows = useMemo(() => {
    const base = data?.rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((row) => row.token.toLowerCase().includes(q) || row.exchange.toLowerCase().includes(q));
  }, [data?.rows, query]);

  const totalTradingPairs = data?.rows?.length ?? 0;
  const totalTokens = useMemo(() => new Set((data?.rows ?? []).map((row) => row.token)).size, [data?.rows]);

  const toggleExchange = (exchange: string) => {
    setSelectedExchanges((prev) => {
      if (prev.includes(exchange)) return prev.filter((item) => item !== exchange);
      return [...prev, exchange];
    });
  };

  return (
    <main className="container">
      <header className="header">
        <h1>Funding Arbitrage Scanner</h1>
        <div className="headerRight">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search token or exchange..."
          />
          <button onClick={() => refetch()}>Refresh</button>
        </div>
      </header>

      <div className="exchangeSelector">
        {EXCHANGES.map((exchange) => (
          <label key={exchange}>
            <input
              type="checkbox"
              checked={selectedExchanges.includes(exchange)}
              onChange={() => toggleExchange(exchange)}
            />
            {exchange}
          </label>
        ))}
      </div>

      <StatusBar
        rowsCount={rows.length}
        totalTokens={totalTokens}
        totalTradingPairs={totalTradingPairs}
        fetchedAt={data?.fetchedAt ?? null}
        isFetching={isFetching}
        errors={data?.errors ?? []}
      />

      <ArbitrageTable rows={rows} onSelect={setSelectedRow} />

      <TokenModal
        row={selectedRow}
        history={selectedRow ? history[selectedRow.id] ?? [] : []}
        onClose={() => setSelectedRow(null)}
      />
    </main>
  );
}
