'use client';
import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import axios from "axios";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScatterChart,
  Scatter,
  Grid,
  XAxis,
  YAxis,
  ChartTooltip,
} from "@workspace/ui/components/charts/scatter-chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Activity, AlertTriangle, CheckCircle, ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

type FilterMode = "all" | "anomalous" | "normal";

export default function LotOverview() {
  const router = useRouter();

  useEffect(() => { document.title = "Lot Overview — LATENT"; }, []);
  const { data: lotsData, error: lotsError } = useSWR(`${API_URL}/api/lots/`, fetcher, swrOpts);
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !selectedLot) {
      setSelectedLot(lotsData.lots[0]);
    }
  }, [lotsData, selectedLot]);

  const { data: lotDetails, isLoading, error: lotError } = useSWR(
    selectedLot ? `${API_URL}/api/lots/${selectedLot}` : null,
    fetcher,
    swrOpts
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } }
  };

  const allComponents = lotDetails?.components || [];
  const flagged = allComponents.filter((c: any) => c.is_anomalous);
  const normal = allComponents.filter((c: any) => !c.is_anomalous);

  // Filter data for the chart
  const chartNormal = filter === "anomalous" ? [] : normal;
  const chartAnomalous = filter === "normal" ? [] : flagged;

  // Filter data for the table
  const tableData = useMemo(() => {
    if (filter === "all") return allComponents;
    if (filter === "anomalous") return flagged;
    return normal;
  }, [filter, allComponents, flagged, normal]);

  const showNormal = filter !== "anomalous";
  const showAnomalous = filter !== "normal";

  const TABLE_LIMIT = filter === "all" ? 15 : 20;

  const filters: { key: FilterMode; label: string; count: number }[] = [
    { key: "all", label: "All", count: allComponents.length },
    { key: "anomalous", label: "Anomalous", count: flagged.length },
    { key: "normal", label: "Normal", count: normal.length },
  ];

  if (lotsError || lotError) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col h-full items-center justify-center text-destructive gap-3 p-8 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-destructive/30 flex items-center justify-center glass-card">
          <span className="text-2xl">!</span>
        </div>
        <h2 className="text-lg font-medium">Connection Failed</h2>
        <p className="text-sm text-muted-foreground/60 font-light">Could not reach the API server</p>
      </motion.div>
    );
  }

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-muted-foreground/20 border-t-chart-1 rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground/50 font-light">Loading lot data...</span>
      </motion.div>
    </div>
  );

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight mb-1">Lot Overview</h1>
          <p className="text-[13px] text-muted-foreground/50 font-light">
            Anomaly distribution by leakage &amp; delay — {allComponents.length} components
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedLot} onValueChange={(v) => setSelectedLot(v ?? "")}>
            <SelectTrigger className="w-44 h-9 glass-card text-sm font-medium rounded-xl">
              <SelectValue placeholder="Select lot" />
            </SelectTrigger>
            <SelectContent className="glass-card rounded-xl">
              {lotsData?.lots?.map((lot: string) => (
                <SelectItem key={lot} value={lot} className="text-sm font-medium">{lot}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: allComponents.length, icon: Activity, color: "oklch(0.7 0.05 250)" },
          { label: "Flagged", value: flagged.length, icon: AlertTriangle, color: "oklch(0.62 0.18 25)" },
          { label: "Normal", value: normal.length, icon: CheckCircle, color: "oklch(0.65 0.12 160)" },
          {
            label: "Anomaly Rate",
            value: allComponents.length > 0 ? `${((flagged.length / allComponents.length) * 100).toFixed(1)}%` : "0%",
            icon: TrendingUp,
            color: "oklch(0.6 0.10 300)"
          },
        ].map((stat) => (
          <motion.div key={stat.label} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
            className="glass-card glass-card-hover rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color, opacity: 0.6 }} />
              <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest font-medium">{stat.label}</span>
            </div>
            <p className="text-xl font-semibold tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Single hybrid scatter chart with filter */}
      <motion.div variants={itemVariants}>
        <div className="glass-card rounded-2xl p-6">
          {/* Chart header + filter controls */}
          <div className="flex items-center justify-between mb-4">
<div>
               <h3 className="text-sm font-medium">Parametric Scatter</h3>
               <p className="text-[10px] text-muted-foreground/35 mt-0.5 font-light">
                 Anomaly distribution by leakage & delay — {allComponents.length} components
               </p>
             </div>

            {/* Filter toggles */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "oklch(0.10 0.003 260)" }}>
              {filters.map((f) => (
                <motion.button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    relative px-3 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider
                    transition-all duration-300 flex items-center gap-1.5
                    ${filter === f.key
                      ? 'text-foreground/90'
                      : 'text-muted-foreground/40 hover:text-foreground/50'
                    }
                  `}
                >
                  {filter === f.key && (
                    <motion.div
                      layoutId="filter-pill"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: f.key === "anomalous"
                          ? "oklch(0.62 0.18 25 / 15%)"
                          : f.key === "normal"
                            ? "oklch(0.7 0.05 250 / 12%)"
                            : "oklch(1 0 0 / 8%)",
                        border: `1px solid ${
                          f.key === "anomalous"
                            ? "oklch(0.62 0.18 25 / 25%)"
                            : f.key === "normal"
                              ? "oklch(0.7 0.05 250 / 20%)"
                              : "oklch(1 0 0 / 10%)"
                        }`,
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {f.key === "anomalous" && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.62 0.18 25)" }} />
                    )}
                    {f.key === "normal" && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.7 0.05 250)" }} />
                    )}
                    {f.label}
                    <span className="tabular-nums opacity-60">{f.count}</span>
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

{/* Legend */}
           <div className="flex items-center gap-5 mb-3 text-[10px]">
             <div className="flex items-center gap-1.5">
               <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(160, 165, 180, 0.7)", border: "1.5px solid rgba(160, 165, 180, 0.4)" }} />
               <span className="text-muted-foreground/50 font-light">Normal</span>
             </div>
             <div className="flex items-center gap-1.5">
               <span className="w-2.5 h-2.5 rounded-full" style={{ background: "oklch(0.62 0.18 25)", border: "1.5px solid oklch(0.62 0.18 25 / 0.5)" }} />
               <span className="text-muted-foreground/50 font-light">Anomalous</span>
             </div>
           </div>

          {/* Axis labels */}
          <div className="relative">
            {/* Y-axis label */}
            <div
              className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 text-[9px] text-muted-foreground/35 uppercase tracking-widest font-medium"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg) translateX(50%) translateY(50%)", marginLeft: "-2px" }}
            >
              Delay (ns)
            </div>

            {/* Hybrid scatter chart — both series in one chart */}
            <AnimatePresence mode="wait">
              <motion.div
                key={filter}
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.7 }}
                transition={{ duration: 0.25 }}
              >
                <ScatterChart
                  data={allComponents}
                  xDataKey="leakage_median"
                  aspectRatio="2.4 / 1"
                  animationDuration={900}
                >
                  <Grid horizontal vertical />

                  <XAxis formatTick={(v) => `${Number(v).toFixed(1)}`} />
                  <YAxis formatTick={(v) => `${Number(v).toFixed(2)}`} />

                  {/* Normal series — grey offset ring style */}
                  {showNormal && (
                    <Scatter
                      data={chartNormal}
                      dataKey="delay_median"
                      fill="rgba(160, 165, 180, 0.65)"
                      stroke="rgba(160, 165, 180, 0.35)"
                      radius={3.5}
                      strokeWidth={1.5}
                      ringGap={2}
                      fadeOnHover
                      inactiveOpacity={0.1}
                      inactiveBlur={2.5}
                      showActiveHighlight
                    />
                  )}

                  {/* Anomalous series — red with larger dots */}
                  {showAnomalous && (
                    <Scatter
                      data={chartAnomalous}
                      dataKey="delay_median"
                      fill="oklch(0.62 0.18 25)"
                      stroke="oklch(0.62 0.18 25 / 0.4)"
                      radius={5}
                      strokeWidth={2}
                      ringGap={2}
                      fadeOnHover
                      inactiveOpacity={0.15}
                      inactiveBlur={2}
                      showActiveHighlight
                    />
                  )}

                  <ChartTooltip
                    renderContent={(row) => {
                      const isAnom = (row as any).is_anomalous;
                      const compId = (row as any).component_id || "—";
                      const defectType = (row as any).defect_type || "unknown";
                      return (
                        <div>
                          <div style={{
                            fontWeight: 600, marginBottom: 8, fontSize: 12,
                            color: isAnom ? "#ef4444" : "rgba(255,255,255,0.85)"
                          }}>
                            {compId}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Leakage</span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                              {Number(row.leakage_median).toFixed(2)} µA
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Delay</span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                              {Number(row.delay_median).toFixed(2)} ns
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Score</span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12, color: isAnom ? '#ef4444' : 'inherit' }}>
                              {Number(row.anomaly_score).toFixed(4)}
                            </span>
                          </div>
                          {isAnom && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0', marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Type</span>
                              <span style={{ fontWeight: 600, fontSize: 11, textTransform: 'capitalize', color: '#ef4444' }}>
                                {defectType}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                </ScatterChart>
              </motion.div>
            </AnimatePresence>

            {/* X-axis label */}
            <div className="text-center text-[9px] text-muted-foreground/35 uppercase tracking-widest font-medium mt-1">
              Leakage Current (µA)
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filtered table */}
      <motion.div variants={itemVariants}>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">
                {filter === "all" ? "All Components" : filter === "anomalous" ? "Anomalous Components" : "Normal Components"}
              </h3>
              <p className="text-[10px] text-muted-foreground/35 mt-0.5 font-light">
                Showing {Math.min(TABLE_LIMIT, tableData.length)} of {tableData.length} — click to inspect
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/5">
                  <th className="px-6 py-3 text-[9px] font-medium text-muted-foreground/35 uppercase tracking-widest">Component</th>
                  <th className="px-6 py-3 text-[9px] font-medium text-muted-foreground/35 uppercase tracking-widest">Lot</th>
                  <th className="px-6 py-3 text-[9px] font-medium text-muted-foreground/35 uppercase tracking-widest">Defect Type</th>
                  <th className="px-6 py-3 text-[9px] font-medium text-muted-foreground/35 uppercase tracking-widest">Score</th>
                  <th className="px-6 py-3 text-[9px] font-medium text-muted-foreground/35 uppercase tracking-widest">Leakage (µA)</th>
                  <th className="px-6 py-3 text-[9px] font-medium text-muted-foreground/35 uppercase tracking-widest">Delay (ns)</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, TABLE_LIMIT).map((c: any, i: number) => (
                  <motion.tr
                    key={c.component_id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.25 }}
                    onClick={() => router.push(`/components/${c.component_id}`)}
                    className={`
                      border-b border-border/3 last:border-0 cursor-pointer transition-colors group
                      ${c.is_anomalous ? 'hover:bg-destructive/5' : 'hover:bg-accent/10'}
                    `}
                  >
                    <td className="px-6 py-3 font-mono text-xs text-foreground/60">{c.component_id}</td>
                    <td className="px-6 py-3 text-xs text-muted-foreground/40 font-light">{c.lot_id}</td>
                    <td className="px-6 py-3">
                      {c.is_anomalous ? (
                        <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md bg-destructive/10 text-destructive/80">
                          {c.defect_type}
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-500/60 font-medium flex items-center gap-1">
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Pass
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-3 font-mono text-xs tabular-nums font-medium ${c.is_anomalous ? 'text-destructive/80' : 'text-muted-foreground/50'}`}>
                      {c.anomaly_score?.toFixed(4)}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-16 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 4%)" }}>
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min((c.leakage_median / 60) * 100, 100)}%`,
                            background: c.is_anomalous ? "oklch(0.62 0.18 25 / 0.6)" : "oklch(0.6 0.04 250 / 0.5)",
                          }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 font-light tabular-nums">{c.leakage_median?.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-16 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 4%)" }}>
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min((c.delay_median / 20) * 100, 100)}%`,
                            background: c.is_anomalous ? "oklch(0.62 0.18 25 / 0.6)" : "oklch(0.6 0.04 250 / 0.5)",
                          }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 font-light tabular-nums">{c.delay_median?.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5" />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableData.length > TABLE_LIMIT && (
            <div className="px-6 py-3 border-t border-border/5 text-center">
              <button
                onClick={() => router.push("/components")}
                className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium hover:text-foreground/60 transition-colors"
              >
                View all {tableData.length} components →
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}