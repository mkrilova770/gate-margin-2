"use client";

import type { ScanApiResponse } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

const HISTORY_LIMIT = 40;

export interface RowHistoryPoint {
  at: string;
  netAPR: number | null;
  borrowAPR: number | null;
  fundingAPR: number | null;
  spread: number | null;
}

export function useArbitrageData(selectedExchanges: string[]) {
  const [history, setHistory] = useState<Record<string, RowHistoryPoint[]>>({});
  const exchangesKey = useMemo(() => selectedExchanges.slice().sort().join(","), [selectedExchanges]);

  const query = useQuery<ScanApiResponse>({
    queryKey: ["scan", exchangesKey],
    queryFn: async () => {
      const query = exchangesKey ? `?exchanges=${encodeURIComponent(exchangesKey)}` : "";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(`/api/scan${query}`, { signal: controller.signal });
        const payload = (await response.json()) as ScanApiResponse;
        if (!response.ok) {
          throw new Error(payload.errors?.[0] ?? "scan request failed");
        }
        return payload;
      } finally {
        clearTimeout(timeout);
      }
    },
    refetchInterval: 30_000,
    retry: 2,
  });

  useEffect(() => {
    if (!query.data?.rows) return;
    setHistory((prev) => {
      const next = { ...prev };
      for (const row of query.data!.rows) {
        const current = next[row.id] ?? [];
        const append: RowHistoryPoint = {
          at: query.data!.fetchedAt,
          netAPR: row.netAPR,
          borrowAPR: row.borrowAPR,
          fundingAPR: row.fundingAPR,
          spread: row.spread,
        };
        next[row.id] = [...current, append].slice(-HISTORY_LIMIT);
      }
      return next;
    });
  }, [query.data]);

  return { ...query, history };
}
