"use client";

import { ArbitrageTable } from "@/components/ArbitrageTable";
import { StatusBar } from "@/components/StatusBar";
import { TokenModal } from "@/components/TokenModal";
import { useArbitrageData } from "@/hooks/useArbitrageData";
import type { ArbitrageRow, ExchangeId, MarginSourceId } from "@/types";
import { useEffect, useMemo, useState } from "react";

const STORAGE_SELECTED_EXCHANGES = "funding-arbitrage-scanner:selectedExchanges";
const STORAGE_MARGIN_SOURCES = "funding-arbitrage-scanner:selectedMarginSources";

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

const MARGIN_SOURCES: MarginSourceId[] = ["Gate", "KuCoin"];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>(EXCHANGES);
  const [exchangePrefsLoaded, setExchangePrefsLoaded] = useState(false);
  const [selectedMarginSources, setSelectedMarginSources] = useState<MarginSourceId[]>(["Gate"]);
  const [marginPrefsLoaded, setMarginPrefsLoaded] = useState(false);
  const [onlyCommonTokens, setOnlyCommonTokens] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ArbitrageRow | null>(null);
  const [borrowChartOverride, setBorrowChartOverride] = useState<"gate" | "kucoin" | null>(null);
  const { data, isFetching, refetch } = useArbitrageData(selectedExchanges, selectedMarginSources);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_SELECTED_EXCHANGES);
      if (!raw) {
        setExchangePrefsLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setExchangePrefsLoaded(true);
        return;
      }
      const valid = parsed.filter((item): item is string => typeof item === "string" && EXCHANGES.includes(item as ExchangeId));
      if (valid.length > 0) {
        setSelectedExchanges(valid);
      }
    } catch {
      /* ignore */
    }
    setExchangePrefsLoaded(true);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_MARGIN_SOURCES);
      if (!raw) {
        setMarginPrefsLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setMarginPrefsLoaded(true);
        return;
      }
      const valid = parsed.filter(
        (item): item is MarginSourceId =>
          typeof item === "string" && MARGIN_SOURCES.includes(item as MarginSourceId),
      );
      if (valid.length > 0) {
        setSelectedMarginSources(valid);
      }
    } catch {
      /* ignore */
    }
    setMarginPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!exchangePrefsLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_SELECTED_EXCHANGES, JSON.stringify(selectedExchanges));
    } catch {
      /* ignore */
    }
  }, [selectedExchanges, exchangePrefsLoaded]);

  useEffect(() => {
    if (!marginPrefsLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_MARGIN_SOURCES, JSON.stringify(selectedMarginSources));
    } catch {
      /* ignore */
    }
  }, [selectedMarginSources, marginPrefsLoaded]);

  const showBothMargins = selectedMarginSources.includes("Gate") && selectedMarginSources.includes("KuCoin");

  const rows = useMemo(() => {
    let base = data?.rows ?? [];
    if (onlyCommonTokens && showBothMargins) {
      const tokens = new Map<string, { gate: boolean; kucoin: boolean }>();
      for (const row of base) {
        const entry = tokens.get(row.token) ?? { gate: false, kucoin: false };
        if (row.borrowAPR_gate != null) entry.gate = true;
        if (row.borrowAPR_kucoin != null) entry.kucoin = true;
        tokens.set(row.token, entry);
      }
      const common = new Set<string>();
      for (const [token, src] of tokens) {
        if (src.gate && src.kucoin) common.add(token);
      }
      base = base.filter((row) => common.has(row.token));
    }
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((row) => row.token.toLowerCase().includes(q) || row.exchange.toLowerCase().includes(q));
  }, [data?.rows, query, onlyCommonTokens, showBothMargins]);

  const totalTradingPairs = data?.rows?.length ?? 0;
  const totalTokens = useMemo(() => new Set((data?.rows ?? []).map((row) => row.token)).size, [data?.rows]);

  const toggleExchange = (exchange: string) => {
    setSelectedExchanges((prev) => {
      if (prev.includes(exchange)) return prev.filter((item) => item !== exchange);
      return [...prev, exchange];
    });
  };

  const toggleMarginSource = (source: MarginSourceId) => {
    setSelectedMarginSources((prev) => {
      if (prev.includes(source)) {
        const next = prev.filter((s) => s !== source);
        return next.length > 0 ? next : prev;
      }
      return [...prev, source];
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

      <div className="marginSourceSelector">
        <span className="marginSourceLabel">Маржа:</span>
        {MARGIN_SOURCES.map((source) => (
          <label key={source}>
            <input
              type="checkbox"
              checked={selectedMarginSources.includes(source)}
              onChange={() => toggleMarginSource(source)}
            />
            {source}
          </label>
        ))}
        {showBothMargins && (
          <label className="commonTokensLabel">
            <input
              type="checkbox"
              checked={onlyCommonTokens}
              onChange={() => setOnlyCommonTokens((v) => !v)}
            />
            Только общие
          </label>
        )}
      </div>

      <StatusBar
        rowsCount={rows.length}
        totalTokens={totalTokens}
        totalTradingPairs={totalTradingPairs}
        fetchedAt={data?.fetchedAt ?? null}
        isFetching={isFetching}
        errors={data?.errors ?? []}
      />

      <ArbitrageTable
        rows={rows}
        onSelect={(row, source) => {
          setBorrowChartOverride(source ?? null);
          setSelectedRow(row);
        }}
        marginSources={selectedMarginSources}
      />

      <TokenModal
        row={selectedRow}
        onClose={() => {
          setSelectedRow(null);
          setBorrowChartOverride(null);
        }}
        marginSources={selectedMarginSources}
        borrowChartOverride={borrowChartOverride}
      />
    </main>
  );
}
