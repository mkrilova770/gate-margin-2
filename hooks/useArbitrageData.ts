"use client";

import type { ScanApiResponse } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

const HISTORY_LIMIT = 40;

export interface RowHistoryPoint {
  at: string;
  rawFunding: number | null;
  intervalHours: number;
  netAPR: number | null;
  borrowAPR: number | null;
  fundingAPR: number | null;
  spread: number | null;
}

export function useArbitrageData(selectedExchanges: string[], marginSources: string[]) {
  const [history, setHistory] = useState<Record<string, RowHistoryPoint[]>>({});
  const exchangesKey = useMemo(() => selectedExchanges.slice().sort().join(","), [selectedExchanges]);
  const marginKey = useMemo(() => marginSources.slice().sort().join(","), [marginSources]);

  const query = useQuery<ScanApiResponse>({
    queryKey: ["scan", exchangesKey, marginKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (exchangesKey) params.set("exchanges", exchangesKey);
      if (marginKey) params.set("marginSources", marginKey);
      const qs = params.toString();
      const url = qs ? `/api/scan?${qs}` : "/api/scan";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(url, { signal: controller.signal });
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
          rawFunding: row.rawFunding,
          intervalHours: row.intervalHours,
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
