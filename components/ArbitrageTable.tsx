"use client";

import type { ArbitrageRow } from "@/types";
import { useEffect, useMemo, useState } from "react";

const STORAGE_HIDDEN_TOKENS = "funding-arbitrage-scanner:hiddenTokens";

interface ArbitrageTableProps {
  rows: ArbitrageRow[];
  onSelect: (row: ArbitrageRow) => void;
}

type SortField =
  | "rawFunding"
  | "netAPR"
  | "fundingAPR"
  | "borrowAPR"
  | "spread"
  | "borrowLiquidityUsdt";

function asNumber(value: number | null): number {
  return value == null || !Number.isFinite(value) ? -999999 : value;
}

function parseOptionalNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function fmt(value: number | null, digits = 2, suffix = "%"): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(digits)}${suffix}`;
}

function fmtBorrow(tokenAmount: number | null, usdtAmount: number | null): string {
  const token = tokenAmount == null ? "n/a" : tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const usdt = usdtAmount == null ? "n/a" : usdtAmount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${token} (~${usdt} USDT)`;
}

function netClass(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "netNeutral";
  if (value < 0) return "netNegative";
  if (value > 0) return "netPositive";
  return "netNeutral";
}

function rowSortValue(row: ArbitrageRow, field: SortField): number {
  return asNumber(row[field] as number | null);
}

function rawFundingStrength(row: ArbitrageRow): number {
  const value = row.rawFunding;
  if (value == null || !Number.isFinite(value)) return -999999;
  return Math.abs(value);
}

function fmtRawFunding(value: number | null, intervalHours: number): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(4)}% /${intervalHours}h`;
}

export function ArbitrageTable({ rows, onSelect }: ArbitrageTableProps) {
  const [sortField, setSortField] = useState<SortField>("netAPR");
  const [sortDesc, setSortDesc] = useState(true);
  const [grouped, setGrouped] = useState(true);
  const [maxBorrowAPR, setMaxBorrowAPR] = useState<string>("");
  const [minLiquidity, setMinLiquidity] = useState<string>("");
  const [hiddenTokens, setHiddenTokens] = useState<Set<string>>(new Set());
  const [hiddenTokensLoaded, setHiddenTokensLoaded] = useState(false);
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_HIDDEN_TOKENS);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const list = parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
          setHiddenTokens(new Set(list));
        }
      }
    } catch {
      /* ignore */
    }
    setHiddenTokensLoaded(true);
  }, []);

  useEffect(() => {
    if (!hiddenTokensLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_HIDDEN_TOKENS, JSON.stringify([...hiddenTokens].sort()));
    } catch {
      /* ignore */
    }
  }, [hiddenTokens, hiddenTokensLoaded]);

  const filtered = useMemo(() => {
    const maxBorrow = parseOptionalNumber(maxBorrowAPR);
    const minLiq = parseOptionalNumber(minLiquidity);
    return rows.filter((row) => {
      if (hiddenTokens.has(row.token)) return false;
      if (Number.isFinite(maxBorrow) && (row.borrowAPR ?? Infinity) > maxBorrow) return false;
      if (Number.isFinite(minLiq) && (row.borrowLiquidityUsdt ?? 0) < minLiq) return false;
      return true;
    });
  }, [rows, maxBorrowAPR, minLiquidity, hiddenTokens]);

  const groupedRows = useMemo(() => {
    const byToken = filtered.reduce<Record<string, ArbitrageRow[]>>((acc, row) => {
      if (!acc[row.token]) acc[row.token] = [];
      acc[row.token].push(row);
      return acc;
    }, {});
    const tokenEntries = Object.entries(byToken).map(([token, tokenRows]) => {
      const sortedByRawFunding = [...tokenRows].sort(
        (a, b) => rawFundingStrength(b) - rawFundingStrength(a)
      );
      return { token, top: sortedByRawFunding[0], others: sortedByRawFunding.slice(1) };
    });
    tokenEntries.sort((a, b) => {
      const av = rowSortValue(a.top, sortField);
      const bv = rowSortValue(b.top, sortField);
      return sortDesc ? bv - av : av - bv;
    });
    return tokenEntries;
  }, [filtered, sortField, sortDesc]);

  const flatRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = rowSortValue(a, sortField);
      const bv = rowSortValue(b, sortField);
      return sortDesc ? bv - av : av - bv;
    });
  }, [filtered, sortField, sortDesc]);

  const exchangeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.token, (map.get(row.token) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const toggleHidden = (token: string) => {
    setHiddenTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };
  const hiddenTokenList = useMemo(() => [...hiddenTokens].sort(), [hiddenTokens]);

  const toggleExpanded = (token: string) => {
    setExpandedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDesc((prev) => !prev);
      return;
    }
    setSortField(field);
    setSortDesc(true);
  };

  const sortMark = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDesc ? " ↓" : " ↑";
  };

  return (
    <>
      <div className="tableControls">
        <button onClick={() => setGrouped((v) => !v)}>{grouped ? "Grouped by token" : "Flat mode"}</button>
        <input
          placeholder="Max Borrow APR"
          value={maxBorrowAPR}
          onChange={(event) => setMaxBorrowAPR(event.target.value)}
        />
        <input
          placeholder="Min Liquidity (USDT)"
          value={minLiquidity}
          onChange={(event) => setMinLiquidity(event.target.value)}
        />
        <button onClick={() => setHiddenTokens(new Set())}>Clear hidden</button>
      </div>
      {hiddenTokenList.length > 0 ? (
        <div className="hiddenTokensBar">
          <span>Hidden tokens:</span>
          {hiddenTokenList.map((token) => (
            <button
              key={token}
              onClick={() => {
                setHiddenTokens((prev) => {
                  const next = new Set(prev);
                  next.delete(token);
                  return next;
                });
              }}
            >
              {token} ×
            </button>
          ))}
        </div>
      ) : null}
      <table className="table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Best Exchange</th>
            <th onClick={() => handleSort("rawFunding")}>Raw Funding{sortMark("rawFunding")}</th>
            <th onClick={() => handleSort("netAPR")}>Net APR{sortMark("netAPR")}</th>
            <th onClick={() => handleSort("fundingAPR")}>Funding APR{sortMark("fundingAPR")}</th>
            <th onClick={() => handleSort("borrowAPR")}>Borrow APR{sortMark("borrowAPR")}</th>
            <th onClick={() => handleSort("spread")}>Spread{sortMark("spread")}</th>
            <th onClick={() => handleSort("borrowLiquidityUsdt")}>
              Available Borrow{sortMark("borrowLiquidityUsdt")}
            </th>
            <th>Exchanges</th>
            <th>Next Funding</th>
          </tr>
        </thead>
        <tbody>
          {grouped
            ? groupedRows.flatMap(({ token, top, others }) => {
                const isExpanded = expandedTokens.has(token);
                const mainRow = (
                  <tr key={top.id} onClick={() => onSelect(top)}>
                    <td>
                      <div className="tokenCell">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpanded(token);
                          }}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                        <strong>{top.token}</strong>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleHidden(top.token);
                          }}
                        >
                          Hide
                        </button>
                      </div>
                    </td>
                    <td>{top.exchange}</td>
                    <td>{fmtRawFunding(top.rawFunding, top.intervalHours)}</td>
                    <td className={netClass(top.netAPR)}>{fmt(top.netAPR)}</td>
                    <td>{fmt(top.fundingAPR)}</td>
                    <td>{fmt(top.borrowAPR)}</td>
                    <td>{fmt(top.spread)}</td>
                    <td>{fmtBorrow(top.borrowLiquidityToken, top.borrowLiquidityUsdt)}</td>
                    <td>{exchangeCounts.get(top.token) ?? 1}</td>
                    <td>{top.nextFundingTime ? new Date(top.nextFundingTime).toLocaleString() : "n/a"}</td>
                  </tr>
                );
                const childRows = isExpanded
                  ? others.map((row) => (
                      <tr key={row.id} onClick={() => onSelect(row)}>
                        <td>
                          <div className="tokenCell">
                            <span style={{ opacity: 0.7 }}>└</span>
                            <span>{row.token}</span>
                          </div>
                        </td>
                        <td>{row.exchange}</td>
                        <td>{fmtRawFunding(row.rawFunding, row.intervalHours)}</td>
                        <td className={netClass(row.netAPR)}>{fmt(row.netAPR)}</td>
                        <td>{fmt(row.fundingAPR)}</td>
                        <td>{fmt(row.borrowAPR)}</td>
                        <td>{fmt(row.spread)}</td>
                        <td>{fmtBorrow(row.borrowLiquidityToken, row.borrowLiquidityUsdt)}</td>
                        <td>{exchangeCounts.get(row.token) ?? 1}</td>
                        <td>{row.nextFundingTime ? new Date(row.nextFundingTime).toLocaleString() : "n/a"}</td>
                      </tr>
                    ))
                  : [];
                return [mainRow, ...childRows];
              })
            : flatRows.map((row) => (
                <tr key={row.id} onClick={() => onSelect(row)}>
                  <td>
                    <div className="tokenCell">
                      <strong>{row.token}</strong>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleHidden(row.token);
                        }}
                      >
                        Hide
                      </button>
                    </div>
                  </td>
                  <td>{row.exchange}</td>
                  <td>{fmtRawFunding(row.rawFunding, row.intervalHours)}</td>
                  <td className={netClass(row.netAPR)}>{fmt(row.netAPR)}</td>
                  <td>{fmt(row.fundingAPR)}</td>
                  <td>{fmt(row.borrowAPR)}</td>
                  <td>{fmt(row.spread)}</td>
                  <td>{fmtBorrow(row.borrowLiquidityToken, row.borrowLiquidityUsdt)}</td>
                  <td>{exchangeCounts.get(row.token) ?? 1}</td>
                  <td>{row.nextFundingTime ? new Date(row.nextFundingTime).toLocaleString() : "n/a"}</td>
                </tr>
              ))}
        </tbody>
      </table>
      <div className="sortRow">
        <span>Sort: {sortField}</span>
        <button onClick={() => setSortDesc((v) => !v)}>{sortDesc ? "Desc" : "Asc"}</button>
      </div>
    </>
  );
}
