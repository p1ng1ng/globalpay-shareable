"use client";

import { useState } from "react";

export type ChartPoint = {
  label: string;
  value: number;
  detail?: string;
};

export type RankedRow = {
  label: string;
  value: number;
  detail?: string;
};

export type DonutRow = {
  label: string;
  value: number;
  color: string;
  detail?: string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatChartValue(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function VolumeLineChart({ points }: { points: ChartPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 960;
  const height = 270;
  const padX = 42;
  const padY = 28;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padY * 2;
  const safePoints = points.length ? points : [{ label: "No data", value: 0 }];
  const maxValue = Math.max(1, ...safePoints.map((point) => point.value));

  const coords = safePoints.map((point, index) => {
    const x =
      safePoints.length === 1
        ? width / 2
        : padX + (index / (safePoints.length - 1)) * plotWidth;
    const y = padY + plotHeight - (point.value / maxValue) * plotHeight;
    return { ...point, x, y };
  });

  const linePath = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${height - padY} L ${coords[0].x.toFixed(2)} ${height - padY} Z`;
  const active = activeIndex === null ? null : coords[activeIndex];

  return (
    <div className="relative min-h-[300px] rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[280px] w-full overflow-visible"
        role="img"
        aria-label="Total volume line graph"
      >
        <defs>
          <linearGradient id="volumeLineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--gp-accent-2)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--gp-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = padY + step * plotHeight;
          return (
            <line
              key={step}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="var(--gp-border)"
              strokeDasharray="5 8"
              strokeWidth="1"
            />
          );
        })}

        <path d={areaPath} fill="url(#volumeLineFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--gp-accent-2)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
        />

        {coords.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={activeIndex === index ? 8 : 6}
              fill="var(--gp-panel-solid)"
              stroke="var(--gp-accent-2)"
              strokeWidth="4"
              className="cursor-pointer transition-all"
              tabIndex={0}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
            >
              <title>{`${point.label}: ${formatChartValue(point.value)}${point.detail ? ` - ${point.detail}` : ""}`}</title>
            </circle>
          </g>
        ))}

        {coords.map((point, index) => {
          if (index % Math.ceil(coords.length / 8) !== 0 && index !== coords.length - 1) return null;

          return (
            <text
              key={`${point.label}-axis`}
              x={point.x}
              y={height - 4}
              fill="var(--gp-muted)"
              fontSize="20"
              fontWeight="700"
              textAnchor="middle"
            >
              {point.label}
            </text>
          );
        })}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute z-10 min-w-44 rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-sm shadow-2xl"
          style={{
            left: `${clampPercent((active.x / width) * 100)}%`,
            top: `${clampPercent((active.y / height) * 100)}%`,
            transform: "translate(-50%, calc(-100% - 14px))",
          }}
        >
          <p className="text-xs font-bold text-slate-400">{active.label}</p>
          <p className="mt-1 font-black text-white">{formatChartValue(active.value)}</p>
          {active.detail ? <p className="mt-1 text-xs text-slate-400">{active.detail}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function HorizontalBarChart({
  rows,
  valueFormatter = formatChartValue,
}: {
  rows: RankedRow[];
  valueFormatter?: (value: number) => string;
}) {
  const safeRows = rows.length ? rows : [{ label: "No data", value: 0, detail: "Waiting for activity" }];
  const maxValue = Math.max(1, ...safeRows.map((row) => row.value));

  return (
    <div className="space-y-4">
      {safeRows.map((row) => (
        <div key={row.label}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-white">{row.label}</p>
              {row.detail ? <p className="text-xs font-medium text-slate-400">{row.detail}</p> : null}
            </div>
            <p className="shrink-0 text-sm font-extrabold text-slate-300">{valueFormatter(row.value)}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${Math.max(3, (row.value / maxValue) * 100)}%` }}
              title={`${row.label}: ${valueFormatter(row.value)}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  rows,
  centerLabel,
  centerValue,
}: {
  rows: DonutRow[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.value, 0));
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
      <div className="relative mx-auto h-[220px] w-[220px]">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="var(--gp-panel-strong)"
            strokeWidth="22"
          />
          {rows.map((row) => {
            const dash = (row.value / total) * circumference;
            const circle = (
              <circle
                key={row.label}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={row.color}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                strokeWidth="22"
              >
                <title>{`${row.label}: ${row.detail || row.value}`}</title>
              </circle>
            );
            offset += dash;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-2xl font-black text-white">{centerValue}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">{centerLabel}</p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-white">{row.label}</p>
                {row.detail ? <p className="text-xs font-medium text-slate-400">{row.detail}</p> : null}
              </div>
            </div>
            <p className="font-mono text-sm font-bold text-slate-300">
              {((row.value / total) * 100).toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
