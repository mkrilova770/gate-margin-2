"use client";

interface StatusBarProps {
  rowsCount: number;
  totalTokens: number;
  totalTradingPairs: number;
  fetchedAt: string | null;
  isFetching: boolean;
  errors: string[];
}

export function StatusBar({
  rowsCount,
  totalTokens,
  totalTradingPairs,
  fetchedAt,
  isFetching,
  errors,
}: StatusBarProps) {
  const secondsAgo = fetchedAt ? Math.max(0, Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000)) : null;

  return (
    <div className="statusBar">
      <span>{isFetching ? "Updating..." : "Live"}</span>
      <span>Opportunities: {rowsCount}</span>
      <span>Total tokens: {totalTokens}</span>
      <span>Total trading pairs: {totalTradingPairs}</span>
      <span>Updated: {secondsAgo == null ? "n/a" : `${secondsAgo}s ago`}</span>
      <span>Partial errors: {errors.length}</span>
    </div>
  );
}
