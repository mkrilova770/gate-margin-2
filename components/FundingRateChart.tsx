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

interface FundingRateChartProps {
  entries: Array<{ time: string; rawFundingRate: number }>;
  loading?: boolean;
}

function formatPct6(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(6)}%`;
}

function formatPct5(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(5)}%`;
}

/** Build chart rows: chronological, one point per timestamp (last wins), percent = raw * 100 */
function buildChartSeries(entries: Array<{ time: string; rawFundingRate: number }>) {
  const byTs = new Map<number, number>();
  for (const e of entries) {
    const ts = new Date(e.time).getTime();
    const raw = Number(e.rawFundingRate);
    if (!Number.isFinite(ts) || Number.isNaN(ts) || !Number.isFinite(raw)) continue;
    byTs.set(ts, raw);
  }
  const rows = [...byTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, raw]) => ({
      ts,
      pct: raw * 100,
    }));
  return rows;
}

export function FundingRateChart({ entries, loading }: FundingRateChartProps) {
  const chartData = useMemo(() => buildChartSeries(entries), [entries]);

  const latestPct = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData[chartData.length - 1].pct;
  }, [chartData]);

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
    // Всегда включаем 0% в ось, чтобы линия «ноль» была видна (сверху/снизу при односторонних данных)
    if (min > 0) lo = 0;
    if (max < 0) hi = 0;
    return [lo, hi];
  }, [chartData]);

  if (loading) {
    return (
      <div className="fundingChartPanel">
        <div className="fundingChartLoading">Загрузка графика…</div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="fundingChartPanel">
        <div className="fundingChartEmpty">Нет данных для графика за 14 дней</div>
      </div>
    );
  }

  return (
    <div className="fundingChartPanel">
      <div className="fundingChartToolbar">
        <div className="fundingChartTitle">
          Ставка финансирования:{" "}
          <span className="fundingChartTitleValue">{latestPct == null ? "—" : formatPct5(latestPct)}</span>
        </div>
        <div className="fundingChartRangeLabel">Последние 14Д</div>
      </div>

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
              tickFormatter={(v) => `${Number(v).toFixed(6)}%`}
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
              formatter={(value) => [formatPct6(Number(value ?? 0)), "Ставка"]}
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
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#16a34a" }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
