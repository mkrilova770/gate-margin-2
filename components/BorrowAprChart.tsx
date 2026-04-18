"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BorrowAprChartProps {
  entries: Array<{ time: string; borrowAprPercent: number }>;
  loading?: boolean;
  /** Explains data source / that true margin history is not public */
  disclaimer?: string | null;
}

function formatPct4(value: number): string {
  return `${value.toFixed(4)}%`;
}

function buildChartSeries(entries: Array<{ time: string; borrowAprPercent: number }>) {
  const byTs = new Map<number, number>();
  for (const e of entries) {
    const ts = new Date(e.time).getTime();
    const pct = Number(e.borrowAprPercent);
    if (!Number.isFinite(ts) || Number.isNaN(ts) || !Number.isFinite(pct)) continue;
    byTs.set(ts, pct);
  }
  return [...byTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, pct]) => ({ ts, pct }));
}

export function BorrowAprChart({ entries, loading, disclaimer }: BorrowAprChartProps) {
  const chartData = useMemo(() => buildChartSeries(entries), [entries]);

  const latestPct = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData[chartData.length - 1].pct;
  }, [chartData]);

  const rangeLabel = useMemo(() => {
    if (entries.length >= 48) return "14 дн · почасово";
    if (entries.length >= 2 && entries.length < 48) return "14 дн · редкие точки";
    return "14 дн";
  }, [entries.length]);

  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (chartData.length === 0) return ["auto", "auto"];
    let min = chartData[0].pct;
    let max = chartData[0].pct;
    for (const d of chartData) {
      if (d.pct < min) min = d.pct;
      if (d.pct > max) max = d.pct;
    }
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 0.0001;
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.08;
    let lo = min - pad;
    let hi = max + pad;
    if (min > 0) lo = 0;
    if (max < 0) hi = 0;
    return [lo, hi];
  }, [chartData]);

  if (loading) {
    return (
      <div className="fundingChartPanel">
        <div className="fundingChartLoading">Загрузка графика займа…</div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="fundingChartPanel">
        <div className="fundingChartEmpty">Нет ставки займа Gate для этого токена (margin_loan_info)</div>
      </div>
    );
  }

  return (
    <div className="fundingChartPanel">
      <div className="fundingChartToolbar">
        <div className="fundingChartTitle">
          Маржинальный займ Gate (как в таблице):{" "}
          <span className="fundingChartTitleValue borrowAprChartTitleValue">
            {latestPct == null ? "—" : formatPct4(latestPct)}
          </span>
        </div>
        <div className="fundingChartRangeLabel">{rangeLabel}</div>
      </div>
      {disclaimer ? <div className="borrowAprDisclaimer">{disclaimer}</div> : null}

      <div className="fundingChartPlot">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 12, right: 18, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              type="number"
              dataKey="ts"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              tickFormatter={(v) =>
                new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit" }).format(new Date(Number(v)))
              }
              minTickGap={28}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v) => `${Number(v).toFixed(4)}%`}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              width={82}
            />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [formatPct4(Number(value ?? 0)), "Borrow APR"]}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as { ts?: number } | undefined;
                if (!p?.ts) return "";
                return new Intl.DateTimeFormat("ru-RU", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(p.ts));
              }}
            />
            <ReferenceLine
              y={0}
              stroke="#475569"
              strokeWidth={2}
              strokeOpacity={0.85}
              strokeDasharray="6 4"
              label={{
                value: "0%",
                position: "right",
                fill: "#475569",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="#ea580c"
              strokeWidth={2}
              dot={{ r: 2, fill: "#ea580c", strokeWidth: 0 }}
              activeDot={{ r: 4, fill: "#c2410c" }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
