"use client";

import { useState } from "react";

type ProgressEntry = {
  id: string;
  createdAt: number;
  value: number;
};

function formatShortDate(ts: number) {
  const date = new Date(ts);
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDeadlineEnd(deadline: string) {
  if (!deadline) return null;
  const timestamp = new Date(`${deadline}T23:59:59.999`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatTickValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export default function ProgressChart({
  entries,
  target,
  unit,
  deadline,
}: {
  entries: ProgressEntry[];
  target: number;
  unit: string;
  deadline: string;
}) {
  const [todayTs] = useState(() => Date.now());

  if (entries.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md bg-stone-100 px-4 text-center text-sm text-stone-600">
        No progress records yet. Add a record to draw the chart.
      </div>
    );
  }

  const sorted = entries.slice().sort((a, b) => a.createdAt - b.createdAt);
  const width = 720;
  const height = 300;
  const padding = { top: 18, right: 22, bottom: 54, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const latestRecordTs = sorted[sorted.length - 1].createdAt;
  const deadlineTs = parseDeadlineEnd(deadline);
  const hasPassedDeadline = deadlineTs !== null && deadlineTs < todayTs;
  const minTs = Math.min(sorted[0].createdAt, todayTs, hasPassedDeadline ? deadlineTs : sorted[0].createdAt);
  const maxTs = Math.max(latestRecordTs, deadlineTs ?? latestRecordTs, todayTs);
  const maxValue = Math.max(target, ...sorted.map((entry) => entry.value), 1);
  const yMax = Math.ceil(maxValue * 1.1);

  function xFor(ts: number) {
    if (maxTs === minTs) return padding.left + plotWidth / 2;
    return padding.left + ((ts - minTs) / (maxTs - minTs)) * plotWidth;
  }

  function yFor(value: number) {
    return padding.top + plotHeight - (value / yMax) * plotHeight;
  }

  const linePath = sorted
    .map((entry, index) => `${index === 0 ? "M" : "L"} ${xFor(entry.createdAt)} ${yFor(entry.value)}`)
    .join(" ");
  const areaPath = `${linePath} L ${xFor(sorted.at(-1)?.createdAt ?? minTs)} ${padding.top + plotHeight} L ${xFor(
    sorted[0].createdAt,
  )} ${padding.top + plotHeight} Z`;
  const goalY = yFor(target);
  const todayX = xFor(todayTs);
  const deadlineX = hasPassedDeadline && deadlineTs !== null ? xFor(deadlineTs) : null;
  const latestRecordX = xFor(latestRecordTs);
  const ticks = [0, target / 2, target];

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Goal progress chart"
        className="block h-auto w-full max-w-full"
      >
        <defs>
          <linearGradient id="progress-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#047857" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#047857" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="#fafaf9" rx="6" />

        {ticks.map((tick, index) => (
          <g key={`${tick}-${index}`}>
            <line
              x1={padding.left}
              x2={padding.left + plotWidth}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="#e7e5e4"
            />
            <text x={padding.left - 10} y={yFor(tick) + 4} textAnchor="end" className="fill-stone-500 text-xs">
              {formatTickValue(tick)}
            </text>
          </g>
        ))}

        <line
          x1={padding.left}
          x2={padding.left + plotWidth}
          y1={goalY}
          y2={goalY}
          stroke="#b45309"
          strokeDasharray="6 6"
          strokeWidth="2"
        />
        <text x={padding.left + plotWidth - 4} y={goalY - 8} textAnchor="end" className="fill-amber-700 text-xs">
          Target {target} {unit}
        </text>

        {deadlineX !== null && (
          <>
            <line
              x1={deadlineX}
              x2={deadlineX}
              y1={padding.top}
              y2={padding.top + plotHeight}
              stroke="#dc2626"
              strokeDasharray="5 5"
              strokeWidth="2"
            />
            <text
              x={Math.min(deadlineX + 6, padding.left + plotWidth - 4)}
              y={padding.top + 32}
              textAnchor={deadlineX > padding.left + plotWidth - 80 ? "end" : "start"}
              className="fill-red-600 text-xs"
            >
              Target date
            </text>
          </>
        )}

        <line
          x1={todayX}
          x2={todayX}
          y1={padding.top}
          y2={padding.top + plotHeight}
          stroke="#0f766e"
          strokeDasharray="4 5"
          strokeWidth="2"
        />
        <text x={todayX + 6} y={padding.top + 14} textAnchor="start" className="fill-teal-700 text-xs">
          Today
        </text>

        <path d={areaPath} fill="url(#progress-fill)" />
        <path d={linePath} fill="none" stroke="#047857" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />

        {sorted.map((entry) => (
          <g key={entry.id}>
            <circle cx={xFor(entry.createdAt)} cy={yFor(entry.value)} r="5" fill="#047857" />
            <title>
              {formatShortDate(entry.createdAt)}: {entry.value} {unit}
            </title>
          </g>
        ))}

        <text x={padding.left} y={height - 8} textAnchor="start" className="fill-stone-500 text-xs">
          {formatShortDate(minTs)}
        </text>
        <text x={padding.left + plotWidth} y={height - 8} textAnchor="end" className="fill-stone-500 text-xs">
          {formatShortDate(maxTs)}
        </text>
        <text x={latestRecordX} y={height - 26} textAnchor="middle" className="fill-emerald-700 text-xs">
          {formatShortDate(latestRecordTs)}
        </text>
      </svg>
    </div>
  );
}
