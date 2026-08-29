"use client";

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { extent } from "d3-array";
import useMeasure from "react-use-measure";
import { motion } from "motion/react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface SeriesMeta {
  dataKey: string;
  fill: string;
  label: string;
}

interface ChartContext {
  data: Record<string, unknown>[];
  xDataKey: string;
  xScale: (v: unknown) => number;
  yScale: (v: number) => number;
  yDomain: [number, number];
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;
  activeIndex: number | null;
  setActiveIndex: (i: number | null) => void;
  animationDuration: number;
  seriesIndex: number;
  bumpSeriesIndex: () => number;
  registerSeries: (meta: SeriesMeta) => void;
  seriesList: SeriesMeta[];
}

const Ctx = createContext<ChartContext | null>(null);
function useChart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("Must be inside <ScatterChart>");
  return c;
}

/* ------------------------------------------------------------------ */
/*  Palette                                                            */
/* ------------------------------------------------------------------ */

const PALETTE = [
  "rgba(180, 180, 190, 0.85)",
  "rgba(140, 140, 155, 0.75)",
  "rgba(110, 110, 130, 0.7)",
  "rgba(90, 90, 110, 0.65)",
  "rgba(75, 75, 95, 0.6)",
];

/* ------------------------------------------------------------------ */
/*  ScatterChart                                                       */
/* ------------------------------------------------------------------ */

export interface ScatterChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  margin?: Partial<Margin>;
  animationDuration?: number;
  aspectRatio?: string;
  children?: ReactNode;
}

export function ScatterChart({
  data,
  xDataKey = "date",
  margin: marginProp,
  animationDuration = 1100,
  aspectRatio = "2 / 1",
  children,
}: ScatterChartProps) {
  const [ref, bounds] = useMeasure();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const seriesCounter = useRef(0);
  const [seriesList, setSeriesList] = useState<SeriesMeta[]>([]);

  const margin: Margin = {
    top: marginProp?.top ?? 32,
    right: marginProp?.right ?? 32,
    bottom: marginProp?.bottom ?? 52,
    left: marginProp?.left ?? 16,
  };

  const width = bounds.width || 1;
  const height = bounds.height || 1;
  const innerWidth = Math.max(width - margin.left - margin.right, 1);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 1);

  const xScale = useMemo(() => {
    const vals = data.map((d) => d[xDataKey]);
    const isDate = vals[0] instanceof Date;
    if (isDate) {
      const [min, max] = extent(vals as Date[]);
      return scaleTime()
        .domain([min ?? new Date(), max ?? new Date()])
        .range([0, innerWidth]);
    }
    const nums = vals.map(Number);
    const [min, max] = extent(nums);
    return scaleLinear()
      .domain([min ?? 0, max ?? 1])
      .range([0, innerWidth])
      .nice();
  }, [data, xDataKey, innerWidth]);

  const yDomain = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of data) {
      for (const [k, v] of Object.entries(row)) {
        if (k === xDataKey) continue;
        if (typeof v === "number") {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (!isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.1 || 1;
    return [lo - pad, hi + pad];
  }, [data, xDataKey]);

  const yScale = useMemo(
    () => scaleLinear().domain(yDomain).range([innerHeight, 0]).nice(),
    [yDomain, innerHeight]
  );

  const bumpSeriesIndex = useCallback(() => {
    return seriesCounter.current++;
  }, []);

  const registerSeries = useCallback((meta: SeriesMeta) => {
    setSeriesList((prev) => {
      if (prev.find((s) => s.dataKey === meta.dataKey)) return prev;
      return [...prev, meta];
    });
  }, []);

  seriesCounter.current = 0;

  const ctx: ChartContext = {
    data,
    xDataKey,
    xScale: xScale as (v: unknown) => number,
    yScale,
    yDomain,
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    activeIndex,
    setActiveIndex,
    animationDuration,
    seriesIndex: 0,
    bumpSeriesIndex,
    registerSeries,
    seriesList,
  };

  /* Invisible overlay for precise mouse tracking */
  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;

    // Find closest data point by x position
    let closestIdx = 0;
    let closestDist = Infinity;
    data.forEach((row, i) => {
      const px = (xScale as (v: unknown) => number)(row[xDataKey]);
      const dist = Math.abs(px - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    setActiveIndex(closestIdx);
  };

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        aspectRatio,
        position: "relative",
        borderRadius: 12,
        background: "oklch(0.12 0 0)",
        overflow: "hidden",
      }}
    >
      {bounds.width > 0 && (
        <Ctx.Provider value={ctx}>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: "block" }}
          >
            <g transform={`translate(${margin.left},${margin.top})`}>
              {children}

              {/* Invisible mouse-tracking overlay */}
              <rect
                x={0}
                y={0}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setActiveIndex(null)}
                style={{ cursor: "crosshair" }}
              />
            </g>
          </svg>
        </Ctx.Provider>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid                                                               */
/* ------------------------------------------------------------------ */

export interface GridProps {
  horizontal?: boolean;
  vertical?: boolean;
}

export function Grid({ horizontal = false, vertical = false }: GridProps) {
  const { xScale, yScale, innerWidth, innerHeight } = useChart();

  const hLines = horizontal
    ? (yScale as ReturnType<typeof scaleLinear>).ticks(5)
    : [];
  const vLines = vertical
    ? (xScale as ReturnType<typeof scaleLinear>).ticks?.(8) ?? []
    : [];

  return (
    <g className="chart-grid">
      {hLines.map((t: number) => (
        <line
          key={`h-${t}`}
          x1={0}
          x2={innerWidth}
          y1={yScale(t)}
          y2={yScale(t)}
          stroke="rgba(255,255,255,0.07)"
          strokeDasharray="4 6"
        />
      ))}
      {vLines.map((t: number) => (
        <line
          key={`v-${t}`}
          x1={(xScale as (v: number) => number)(t)}
          x2={(xScale as (v: number) => number)(t)}
          y1={0}
          y2={innerHeight}
          stroke="rgba(255,255,255,0.05)"
          strokeDasharray="4 6"
        />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  XAxis                                                              */
/* ------------------------------------------------------------------ */

export interface XAxisProps {
  tickCount?: number;
  formatTick?: (v: unknown) => string;
}

export function XAxis({ tickCount = 4, formatTick }: XAxisProps) {
  const { xScale, innerHeight } = useChart();

  const ticks = useMemo(() => {
    const s = xScale as ReturnType<typeof scaleLinear>;
    if (typeof s.ticks === "function") return s.ticks(tickCount);
    return [];
  }, [xScale, tickCount]);

  const fmt =
    formatTick ??
    ((v: unknown) => {
      if (v instanceof Date) {
        return v.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }
      return String(v);
    });

  return (
    <g transform={`translate(0,${innerHeight})`}>
      {ticks.map((t: unknown, i: number) => {
        const x = (xScale as (v: unknown) => number)(t);
        return (
          <text
            key={i}
            x={x}
            y={32}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize={12}
            fontFamily="inherit"
            fontWeight={500}
          >
            {fmt(t)}
          </text>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  YAxis                                                              */
/* ------------------------------------------------------------------ */

export interface YAxisProps {
  tickCount?: number;
  formatTick?: (v: number) => string;
}

export function YAxis({ tickCount = 5, formatTick }: YAxisProps) {
  const { yScale, yDomain } = useChart();

  const ticks = useMemo(() => {
    const [min, max] = yDomain;
    const range = max - min;
    const step = range / (tickCount - 1);
    return Array.from({ length: tickCount }, (_, i) => min + i * step);
  }, [yDomain, tickCount]);

  const fmt = formatTick ?? ((v: number) => v.toFixed(2));

  return (
    <g>
      {ticks.map((t: number) => (
        <text
          key={t}
          x={-8}
          y={yScale(t)}
          dy="0.35em"
          textAnchor="end"
          fill="rgba(255,255,255,0.25)"
          fontSize={11}
          fontFamily="inherit"
        >
          {fmt(t)}
        </text>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  ReferenceLine                                                      */
/* ------------------------------------------------------------------ */

export interface ReferenceLineProps {
  y: number;
  stroke?: string;
  strokeDasharray?: string;
  label?: string;
  labelFill?: string;
}

export function ReferenceLine({
  y,
  stroke = "rgba(239,68,68,0.5)",
  strokeDasharray = "6 4",
  label,
  labelFill,
}: ReferenceLineProps) {
  const { yScale, innerWidth } = useChart();
  const py = yScale(y);

  return (
    <g>
      <line
        x1={0}
        x2={innerWidth}
        y1={py}
        y2={py}
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeWidth={1}
      />
      {label && (
        <text
          x={innerWidth - 4}
          y={py - 8}
          textAnchor="end"
          fill={labelFill ?? stroke}
          fontSize={10}
          fontWeight={600}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Scatter                                                            */
/* ------------------------------------------------------------------ */

export interface ScatterProps {
  dataKey: string;
  data?: Record<string, unknown>[];
  label?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  ringGap?: number;
  radius?: number;
  fadeOnHover?: boolean;
  inactiveOpacity?: number;
  inactiveBlur?: number;
  showActiveHighlight?: boolean;
  yGradient?: boolean | { from?: string; to?: string };
}

export function Scatter({
  dataKey,
  data: dataProp,
  label,
  fill: fillProp,
  stroke: strokeProp,
  strokeWidth = 2,
  ringGap = 2,
  radius = 5,
  fadeOnHover = true,
  inactiveOpacity = 0.15,
  inactiveBlur = 3,
  showActiveHighlight = true,
  yGradient,
}: ScatterProps) {
  const ctx = useChart();
  const {
    xScale,
    yScale,
    activeIndex,
    animationDuration,
    registerSeries,
  } = ctx;
  const data = dataProp ?? ctx.data;
  const seriesIdx = useMemo(() => ctx.bumpSeriesIndex(), []);

  const seriesColor = fillProp ?? PALETTE[seriesIdx % PALETTE.length] ?? "#888";
  const gradientId = `scatter-ygrad-${seriesIdx}`;

  // Register this series for the tooltip (must be in useEffect, not useMemo)
  React.useEffect(() => {
    registerSeries({ dataKey, fill: seriesColor, label: String(label ?? dataKey ?? "") });
  }, [dataKey, seriesColor, label, registerSeries]);

  const gradFrom =
    typeof yGradient === "object" ? yGradient.from ?? "#ef4444" : "#ef4444";
  const gradTo =
    typeof yGradient === "object" ? yGradient.to ?? "#10b981" : "#10b981";

  const points = useMemo(() => {
    return data
      .map((row, i) => {
        const xVal = row[ctx.xDataKey];
        const yVal = Number(row[dataKey]);
        const cx = (xScale as (v: unknown) => number)(xVal);
        const cy = yScale(yVal);
        return { cx, cy, yVal, index: i, row };
      })
      .filter((pt) => isFinite(pt.cx) && isFinite(pt.cy));
  }, [data, ctx.xDataKey, dataKey, xScale, yScale]);

  return (
    <g>
      {yGradient && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={gradFrom} stopOpacity={0.8} />
            <stop offset="100%" stopColor={gradTo} stopOpacity={0.8} />
          </linearGradient>
        </defs>
      )}

      {points.map((pt, i) => {
        const isActive = activeIndex === pt.index;
        const anyActive = activeIndex !== null;
        const shouldFade = fadeOnHover && anyActive && !isActive;

        let dotFill = seriesColor;
        if (yGradient) {
          dotFill = `url(#${gradientId})`;
        }

        const ringColor = strokeProp ?? seriesColor;

        return (
          <motion.g
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: shouldFade ? inactiveOpacity : 1,
              scale: 1,
              filter: shouldFade
                ? `blur(${inactiveBlur}px)`
                : "blur(0px)",
            }}
            transition={{
              opacity: { duration: 0.25, ease: "easeOut" },
              filter: { duration: 0.25, ease: "easeOut" },
              scale: {
                type: "spring",
                stiffness: 300,
                damping: 22,
                delay: i * (animationDuration / points.length / 1000),
              },
            }}
          >
            {/* Outer ring */}
            {strokeWidth > 0 && (
              <circle
                cx={pt.cx}
                cy={pt.cy}
                r={radius + ringGap + strokeWidth / 2}
                fill="none"
                stroke={ringColor}
                strokeWidth={strokeWidth}
                opacity={0.6}
              />
            )}

            {/* Inner dot */}
            <circle
              cx={pt.cx}
              cy={pt.cy}
              r={radius}
              fill={dotFill}
              opacity={0.9}
            />

            {/* Active highlight ring */}
            {showActiveHighlight && isActive && (
              <motion.circle
                cx={pt.cx}
                cy={pt.cy}
                r={radius + ringGap + strokeWidth + 4}
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={1.5}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </motion.g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  ChartTooltip                                                       */
/* ------------------------------------------------------------------ */

export interface ChartTooltipProps {
  formatLabel?: (row: Record<string, unknown>) => string;
  renderContent?: (row: Record<string, unknown>) => ReactNode;
}

export function ChartTooltip({
  formatLabel,
  renderContent,
}: ChartTooltipProps) {
  const {
    data,
    xDataKey,
    xScale,
    activeIndex,
    innerHeight,
    innerWidth,
    seriesList,
  } = useChart();

  if (activeIndex === null) return null;
  const row = data[activeIndex];
  if (!row) return null;

  const x = (xScale as (v: unknown) => number)(row[xDataKey]);

  // Format the label
  const labelText = formatLabel
    ? formatLabel(row)
    : row[xDataKey] instanceof Date
    ? (row[xDataKey] as Date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : String(row[xDataKey]);

  // Position tooltip to the right, but flip if too close to edge
  const tooltipRight = x > innerWidth * 0.65;
  const tooltipX = tooltipRight ? x - 16 : x + 16;

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Crosshair vertical line */}
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={innerHeight}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={1}
      />

      {/* Date pill at bottom of crosshair */}
      <foreignObject
        x={x - 52}
        y={innerHeight + 8}
        width={104}
        height={32}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.9)",
            color: "#111",
            borderRadius: 20,
            padding: "4px 14px",
            fontSize: 12,
            fontWeight: 600,
            textAlign: "center",
            whiteSpace: "nowrap",
            width: "fit-content",
            margin: "0 auto",
          }}
        >
          {labelText}
        </div>
      </foreignObject>

      {/* Tooltip card */}
      <foreignObject
        x={tooltipRight ? tooltipX - 190 : tooltipX}
        y={8}
        width={200}
        height={200}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div
          style={{
            background: "rgba(24, 24, 28, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "rgba(255,255,255,0.9)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            width: "fit-content",
            minWidth: 140,
          }}
        >
          {renderContent ? (
            renderContent(row)
          ) : (
            <>
              {/* Date header */}
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 10,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                {labelText}
              </div>
              {/* Series rows */}
              {seriesList.map((series) => {
                const val = row[series.dataKey];
                return (
                  <div
                    key={series.dataKey}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "3px 0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: series.fill,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 13,
                        }}
                      >
                        {series.label}
                      </span>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {typeof val === "number" ? val.toFixed(2) : String(val ?? "")}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </foreignObject>
    </g>
  );
}
