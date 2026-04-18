import { fetchJson } from "@/lib/http";
import { fetchGateBorrowInfo } from "@/lib/exchanges/gate";

const GATE_API_HOST = "https://api.gateio.ws";

/** Hourly rate string → simple annualized % (same order as unified lending APR). */
function hourlyRateToAnnualPercent(hourlyRate: string): number {
  const r = Number(hourlyRate);
  if (!Number.isFinite(r)) return NaN;
  return r * 8760 * 100;
}

interface UnifiedHistoryResponse {
  rates?: Array<{ time: number; rate: string }>;
}

interface UniChartRow {
  time?: number;
  value?: string;
}

/**
 * Fetches hourly unified loan rate history, calibrates to current margin borrow APR
 * from margin_loan_info (same as ArbitrageRow.borrowAPR) so the latest point matches the table.
 */
export async function fetchMarginBorrowAprHistory(
  token: string,
  days: number
): Promise<{
  entries: Array<{ time: string; borrowAprPercent: number }>;
  historyAvailable: boolean;
  disclaimer: string;
}> {
  const t = token.trim().toUpperCase();
  const fromMs = Date.now() - days * 86400000;

  const borrowMap = await fetchGateBorrowInfo([t]);
  const marginApr = borrowMap.get(t)?.borrowAPR ?? null;
  if (marginApr == null || !Number.isFinite(marginApr)) {
    return {
      entries: [],
      historyAvailable: false,
      disclaimer: "",
    };
  }

  const unifiedRows: Array<{ time: number; rate: string }> = [];
  for (let page = 1; page <= 12; page++) {
    const url = `${GATE_API_HOST}/api/v4/unified/history_loan_rate?${new URLSearchParams({
      currency: t,
      tier: "0",
      limit: "100",
      page: String(page),
    }).toString()}`;
    const data = await fetchJson<UnifiedHistoryResponse>(url);
    const rates = data.rates ?? [];
    if (rates.length === 0) break;
    unifiedRows.push(...rates);
    const oldest = Math.min(...rates.map((r) => r.time));
    if (oldest <= fromMs) break;
    if (rates.length < 100) break;
  }

  const byTime = new Map<number, string>();
  for (const row of unifiedRows) {
    byTime.set(row.time, row.rate);
  }

  const sortedAsc = [...byTime.entries()]
    .filter(([time]) => time >= fromMs)
    .sort((a, b) => a[0] - b[0]);

  if (sortedAsc.length > 0) {
    const latest = sortedAsc[sortedAsc.length - 1];
    const uLatest = hourlyRateToAnnualPercent(latest[1]);
    const scale = uLatest > 1e-8 && Number.isFinite(uLatest) ? marginApr / uLatest : 1;

    const entries = sortedAsc.map(([timeMs, rate]) => ({
      time: new Date(timeMs).toISOString(),
      borrowAprPercent: hourlyRateToAnnualPercent(rate) * scale,
    }));

    return {
      entries,
      historyAvailable: true,
      disclaimer:
        "Почасовые данные: публичный API Gate `unified/history_loan_rate` (VIP0). Годовая ставка из часовой оценена как rate×8760×100; затем **масштаб подогнан** к текущей маржинальной ставке из колонки Borrow APR (margin_loan_info), чтобы последняя точка совпадала с таблицей. Форма кривой — как у единого счёта; абсолютный уровень привязан к сканеру.",
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - days * 86400;
  const chartUrl = `${GATE_API_HOST}/api/v4/earn/uni/chart?${new URLSearchParams({
    from: String(fromSec),
    to: String(nowSec),
    asset: t,
  }).toString()}`;
  const chartBody = await fetchJson<UniChartRow[]>(chartUrl).catch(() => null);
  if (Array.isArray(chartBody) && chartBody.length > 0) {
    const parsed = chartBody
      .map((row) => {
        const ts = row.time;
        const v = row.value != null ? Number(String(row.value)) : NaN;
        if (ts == null || !Number.isFinite(ts) || !Number.isFinite(v)) return null;
        return { ts: ts * 1000, annualPct: v };
      })
      .filter((x): x is { ts: number; annualPct: number } => x != null)
      .filter((x) => x.ts >= fromMs)
      .sort((a, b) => a.ts - b.ts);

    if (parsed.length > 0) {
      const last = parsed[parsed.length - 1].annualPct;
      const scale = last > 1e-8 ? marginApr / last : 1;
      const entries = parsed.map((p) => ({
        time: new Date(p.ts).toISOString(),
        borrowAprPercent: p.annualPct * scale,
      }));
      return {
        entries,
        historyAvailable: true,
        disclaimer:
          "Почасовые данные: `earn/uni/chart` (UniLoan). **Масштаб подогнан** к текущей маржинальной ставке Borrow APR (margin_loan_info). Кривая отражает динамику пула UniLoan, уровень — приведён к строке сканера.",
      };
    }
  }

  const MS_DAY = 86400000;
  const now = Date.now();
  const entries = Array.from({ length: days + 1 }, (_, i) => ({
    time: new Date(fromMs + i * MS_DAY).toISOString(),
    borrowAprPercent: marginApr,
  }));
  return {
    entries,
    historyAvailable: false,
    disclaimer:
      "Почасовая история недоступна (нет данных unified/chart). Показана текущая маржинальная ставка (Borrow APR) по дням без изменения.",
  };
}
