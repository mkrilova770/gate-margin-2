"use client";

import { BorrowAprChart } from "@/components/BorrowAprChart";
import { FundingRateChart } from "@/components/FundingRateChart";
import type { ArbitrageRow, MarginSourceId } from "@/types";
import { useEffect, useMemo, useState } from "react";

interface TokenModalProps {
  row: ArbitrageRow | null;
  onClose: () => void;
  marginSources: MarginSourceId[];
  /** When both Gate+KuCoin margin columns are shown, set from which borrow cell the row was opened. */
  borrowChartOverride?: "gate" | "kucoin" | null;
}

interface FundingHistoryRow {
  at: Date;
  rawFunding: number;
}

function formatRawFunding(rawFunding: number | null): string {
  if (rawFunding == null || !Number.isFinite(rawFunding)) return "n/a";
  const percent = rawFunding * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(4)}%`;
}

const MS_DAY = 24 * 60 * 60 * 1000;

function sumFundingSince(rows: FundingHistoryRow[], days: number): number {
  const from = Date.now() - days * MS_DAY;
  return rows.filter((r) => r.at.getTime() >= from).reduce((acc, r) => acc + r.rawFunding, 0);
}

function annualBorrowPercentToHourlyRaw(annualPercentPoints: number): number {
  return (annualPercentPoints / 100) / 8760;
}

function sumBorrowHourlyRawSince(
  entries: Array<{ time: string; borrowAprPercent: number }>,
  days: number
): number {
  const from = Date.now() - days * MS_DAY;
  return entries
    .filter((e) => {
      const t = new Date(e.time).getTime();
      return !Number.isNaN(t) && t >= from && Number.isFinite(e.borrowAprPercent);
    })
    .reduce((acc, e) => acc + annualBorrowPercentToHourlyRaw(e.borrowAprPercent), 0);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function fmtApr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}%`;
}

export function TokenModal({ row, onClose, marginSources, borrowChartOverride = null }: TokenModalProps) {
  const [fundingHistory, setFundingHistory] = useState<FundingHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [borrowAprEntries, setBorrowAprEntries] = useState<Array<{ time: string; borrowAprPercent: number }>>([]);
  const [borrowAprLoading, setBorrowAprLoading] = useState(false);
  const [borrowAprError, setBorrowAprError] = useState<string | null>(null);
  const [borrowAprDisclaimer, setBorrowAprDisclaimer] = useState<string | null>(null);

  const showGate = marginSources.includes("Gate");
  const showKucoin = marginSources.includes("KuCoin");

  useEffect(() => {
    if (!row) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setFundingHistory([]);

    const controller = new AbortController();
    const query = new URLSearchParams({
      exchange: row.exchange,
      token: row.token,
      days: "14",
    }).toString();

    fetch(`/api/funding-history?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          entries?: Array<{ time: string; rawFundingRate: number }>;
          error?: string | null;
        };
        if (payload.error) {
          throw new Error(payload.error);
        }
        const rows = (payload.entries ?? [])
          .map((entry) => ({ at: new Date(entry.time), rawFunding: Number(entry.rawFundingRate) }))
          .filter((entry) => !Number.isNaN(entry.at.getTime()) && Number.isFinite(entry.rawFunding))
          .sort((a, b) => b.at.getTime() - a.at.getTime());
        setFundingHistory(rows);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHistoryError(error instanceof Error ? error.message : "Failed to load funding history");
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });

    return () => controller.abort();
  }, [row?.id]);

  const borrowHistorySource: "gate" | "kucoin" = useMemo(() => {
    if (borrowChartOverride === "gate" || borrowChartOverride === "kucoin") {
      return borrowChartOverride;
    }
    if (!showGate && showKucoin) return "kucoin";
    if (row?.borrowSource === "KuCoin" && showKucoin) return "kucoin";
    return "gate";
  }, [borrowChartOverride, showGate, showKucoin, row?.borrowSource]);

  useEffect(() => {
    if (!row) {
      setBorrowAprEntries([]);
      setBorrowAprLoading(false);
      setBorrowAprError(null);
      setBorrowAprDisclaimer(null);
      return;
    }

    setBorrowAprLoading(true);
    setBorrowAprError(null);
    setBorrowAprEntries([]);
    setBorrowAprDisclaimer(null);

    const controller = new AbortController();
    const query = new URLSearchParams({
      token: row.token,
      days: "14",
    }).toString();

    const endpoint = borrowHistorySource === "kucoin"
      ? `/api/kucoin-borrow-apr-history?${query}`
      : `/api/gate-borrow-apr-history?${query}`;

    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          entries?: Array<{ time: string; borrowAprPercent: number }>;
          error?: string | null;
          disclaimer?: string | null;
        };
        if (payload.error) {
          throw new Error(payload.error);
        }
        const entries = (payload.entries ?? []).filter(
          (e) =>
            typeof e.time === "string" &&
            Number.isFinite(Number(e.borrowAprPercent)) &&
            !Number.isNaN(new Date(e.time).getTime())
        );
        setBorrowAprEntries(entries);
        setBorrowAprDisclaimer(typeof payload.disclaimer === "string" ? payload.disclaimer : null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBorrowAprError(error instanceof Error ? error.message : "Failed to load borrow APR history");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBorrowAprLoading(false);
      });

    return () => controller.abort();
  }, [row?.id, borrowHistorySource]);

  const fundingSums = useMemo(() => {
    if (fundingHistory.length === 0) {
      return {
        d1: null as number | null,
        d3: null as number | null,
        d7: null as number | null,
        d14: null as number | null,
      };
    }
    return {
      d1: sumFundingSince(fundingHistory, 1),
      d3: sumFundingSince(fundingHistory, 3),
      d7: sumFundingSince(fundingHistory, 7),
      d14: sumFundingSince(fundingHistory, 14),
    };
  }, [fundingHistory]);

  const borrowSums = useMemo(() => {
    if (borrowAprEntries.length === 0) {
      return {
        d1: null as number | null,
        d3: null as number | null,
        d7: null as number | null,
        d14: null as number | null,
      };
    }
    return {
      d1: sumBorrowHourlyRawSince(borrowAprEntries, 1),
      d3: sumBorrowHourlyRawSince(borrowAprEntries, 3),
      d7: sumBorrowHourlyRawSince(borrowAprEntries, 7),
      d14: sumBorrowHourlyRawSince(borrowAprEntries, 14),
    };
  }, [borrowAprEntries]);

  if (!row) return null;
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal tokenModal" onClick={(event) => event.stopPropagation()}>
        <div className="tokenModalHeader">
          <h3>
            {row.token} / {row.exchange}
          </h3>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="tokenMetrics">
          <div className="tokenMetricCard">
            <span>Funding APR</span>
            <strong>{row.fundingAPR?.toFixed(2) ?? "n/a"}%</strong>
          </div>
          <div className="tokenMetricCard">
            <span>Raw funding</span>
            <strong>{formatRawFunding(row.rawFunding)} /{row.intervalHours}h</strong>
          </div>
          <div className="tokenMetricCard">
            <span>Net APR</span>
            <strong>{row.netAPR?.toFixed(2) ?? "n/a"}%</strong>
          </div>
          <div className="tokenMetricCard">
            <span>Next funding</span>
            <strong>{row.nextFundingTime ? formatDateTime(new Date(row.nextFundingTime)) : "n/a"}</strong>
          </div>
          {showGate && (
            <div className="tokenMetricCard">
              <span>Borrow APR (Gate)</span>
              <strong className="borrowGateValue">{fmtApr(row.borrowAPR_gate)}</strong>
            </div>
          )}
          {showKucoin && (
            <div className="tokenMetricCard">
              <span>Borrow APR (KuCoin)</span>
              <strong className="borrowKucoinValue">{fmtApr(row.borrowAPR_kucoin)}</strong>
              {row.kucoinMaxBorrow != null && (
                <span className="kucoinSubInfo">
                  Max: {row.kucoinMaxBorrow.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {row.kucoinEstimatedUsdt != null && (
                    <> (~${row.kucoinEstimatedUsdt.toLocaleString(undefined, { maximumFractionDigits: 0 })})</>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="fundingSumsRow" aria-label="Сумма ставок фандинга за период">
          <div className="fundingSumCard">
            <span>Сумма фандинга (1 д)</span>
            <strong className={fundingSums.d1 != null && fundingSums.d1 < 0 ? "rateNegative" : "ratePositive"}>
              {historyLoading ? "…" : fundingSums.d1 == null ? "—" : formatRawFunding(fundingSums.d1)}
            </strong>
          </div>
          <div className="fundingSumCard">
            <span>Сумма фандинга (3 д)</span>
            <strong className={fundingSums.d3 != null && fundingSums.d3 < 0 ? "rateNegative" : "ratePositive"}>
              {historyLoading ? "…" : fundingSums.d3 == null ? "—" : formatRawFunding(fundingSums.d3)}
            </strong>
          </div>
          <div className="fundingSumCard">
            <span>Сумма фандинга (7 д)</span>
            <strong className={fundingSums.d7 != null && fundingSums.d7 < 0 ? "rateNegative" : "ratePositive"}>
              {historyLoading ? "…" : fundingSums.d7 == null ? "—" : formatRawFunding(fundingSums.d7)}
            </strong>
          </div>
          <div className="fundingSumCard">
            <span>Сумма фандинга (14 д)</span>
            <strong className={fundingSums.d14 != null && fundingSums.d14 < 0 ? "rateNegative" : "ratePositive"}>
              {historyLoading ? "…" : fundingSums.d14 == null ? "—" : formatRawFunding(fundingSums.d14)}
            </strong>
          </div>
        </div>

        <div className="fundingSumsRow borrowSumsRow" aria-label="Сумма почасового займа (как raw), из годовой APR">
          <div className="fundingSumCard">
            <span>Сумма займа (1 д)</span>
            <strong className="rateNegative">
              {borrowAprLoading ? "…" : borrowSums.d1 == null ? "—" : formatRawFunding(borrowSums.d1)}
            </strong>
          </div>
          <div className="fundingSumCard">
            <span>Сумма займа (3 д)</span>
            <strong className="rateNegative">
              {borrowAprLoading ? "…" : borrowSums.d3 == null ? "—" : formatRawFunding(borrowSums.d3)}
            </strong>
          </div>
          <div className="fundingSumCard">
            <span>Сумма займа (7 д)</span>
            <strong className="rateNegative">
              {borrowAprLoading ? "…" : borrowSums.d7 == null ? "—" : formatRawFunding(borrowSums.d7)}
            </strong>
          </div>
          <div className="fundingSumCard">
            <span>Сумма займа (14 д)</span>
            <strong className="rateNegative">
              {borrowAprLoading ? "…" : borrowSums.d14 == null ? "—" : formatRawFunding(borrowSums.d14)}
            </strong>
          </div>
        </div>

        <FundingRateChart
          entries={fundingHistory.map((r) => ({ time: r.at.toISOString(), rawFundingRate: r.rawFunding }))}
          loading={historyLoading}
        />

        <>
          <BorrowAprChart
            entries={borrowAprEntries}
            loading={borrowAprLoading}
            disclaimer={borrowAprDisclaimer}
            source={borrowHistorySource}
          />
          {borrowAprError ? (
            <div className="borrowAprGateNote borrowAprGateNoteError">
              Маржинальный займ ({borrowHistorySource === "kucoin" ? "KuCoin" : "Gate"}): {borrowAprError}
            </div>
          ) : null}
        </>

        <div className="fundingHistoryBlock">
          <div className="fundingHistoryTitle">История начислений (14 дн.)</div>
          <div className="fundingHistoryTableWrap">
            <table className="fundingHistoryTable">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Ставка</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={2}>Loading funding history...</td>
                  </tr>
                ) : historyError ? (
                  <tr>
                    <td colSpan={2}>History error: {historyError}</td>
                  </tr>
                ) : fundingHistory.length > 0 ? (
                  fundingHistory.map((entry, index) => (
                    <tr key={`${entry.at.toISOString()}-${index}`}>
                      <td>{formatDateTime(entry.at)}</td>
                      <td className={entry.rawFunding < 0 ? "rateNegative" : "ratePositive"}>
                        {formatRawFunding(entry.rawFunding)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2}>No exchange funding history returned for this symbol</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
