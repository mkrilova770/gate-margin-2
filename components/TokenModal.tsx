"use client";

import type { ArbitrageRow } from "@/types";
import type { RowHistoryPoint } from "@/hooks/useArbitrageData";

interface TokenModalProps {
  row: ArbitrageRow | null;
  history: RowHistoryPoint[];
  onClose: () => void;
}

function miniSeries(history: RowHistoryPoint[], selector: (p: RowHistoryPoint) => number | null): string {
  const points = history.slice(-12).map(selector).filter((v): v is number => v != null && Number.isFinite(v));
  return points.length > 0 ? points.map((v) => v.toFixed(2)).join(" -> ") : "n/a";
}

export function TokenModal({ row, history, onClose }: TokenModalProps) {
  if (!row) return null;
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>
          {row.token} / {row.exchange}
        </h3>
        <p>Funding APR: {row.fundingAPR?.toFixed(2) ?? "n/a"}%</p>
        <p>Borrow APR: {row.borrowAPR?.toFixed(2) ?? "n/a"}%</p>
        <p>Trading fees: {row.tradingFees.toFixed(2)}%</p>
        <p>Net APR: {row.netAPR?.toFixed(2) ?? "n/a"}%</p>
        <p>Spread: {row.spread?.toFixed(2) ?? "n/a"}%</p>
        <hr />
        <p>Funding history: {miniSeries(history, (p) => p.fundingAPR)}</p>
        <p>Borrow history: {miniSeries(history, (p) => p.borrowAPR)}</p>
        <p>Spread history: {miniSeries(history, (p) => p.spread)}</p>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
