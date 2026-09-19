'use client';
import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import axios from "axios";
import type { ComponentSummary, StatCard } from "@/lib/types";
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
import { Activity, AlertTriangle, CheckCircle, ArrowRight, TrendingDown, TrendingUp, Search, Zap, Clock, ShieldCheck, Shield } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

type FilterMode = "all" | "anomalous" | "normal";

// ------------------------------------------------------------
// Safe-to-End-Burn-In Banner
// ------------------------------------------------------------
function BurnInSavingsBanner({ savings }: { savings: any }) {
  if (!savings) return null;

  const {
    clearable_count,
    total_count,
    hours_saved,
    confidence,
    is_lot_fully_clear,
    flagged_count,
  } = savings;

  const confidencePct = Math.round(confidence * 100);
  const partialClear = clearable_count > 0 && !is_lot_fully_clear;
  const noClear = clearable_count === 0;

  // Color scheme based on clearance state
  const scheme = is_lot_fully_clear
    ? {
        glow: "oklch(0.55 0.18 160)",
        glowAlpha: "oklch(0.55 0.18 160 / 12%)",
        border: "oklch(0.55 0.18 160 / 30%)",
        iconBg: "oklch(0.55 0.18 160 / 15%)",
        iconColor: "oklch(0.7 0.18 160)",
        badgeBg: "oklch(0.55 0.18 160 / 18%)",
        badgeText: "oklch(0.75 0.18 160)",
        barFill: "oklch(0.65 0.18 160)",
        label: "Safe to End Burn-In",
        sublabel: "All components cleared by Module A + Module B",
        icon: ShieldCheck,
      }
    : partialClear
    ? {
        glow: "oklch(0.65 0.18 155)",
        glowAlpha: "oklch(0.65 0.18 155 / 15%)",
        border: "oklch(0.65 0.18 155 / 35%)",
        iconBg: "oklch(0.65 0.18 155 / 15%)",
        iconColor: "oklch(0.75 0.18 155)",
        badgeBg: "oklch(0.65 0.18 155 / 20%)",
        badgeText: "oklch(0.85 0.18 155)",
        barFill: "oklch(0.7 0.18 155)",
        label: "Early Clearance Approved",
        sublabel: `Safely cleared ${clearable_count} components. Only ${flagged_count} component${flagged_count !== 1 ? "s" : ""} require${flagged_count === 1 ? "s" : ""} full burn-in.`,
        icon: Shield,
      }
    : {
        glow: "oklch(0.62 0.18 25)",
        glowAlpha: "oklch(0.62 0.18 25 / 8%)",
        border: "oklch(0.62 0.18 25 / 20%)",
        iconBg: "oklch(0.62 0.18 25 / 10%)",
        iconColor: "oklch(0.7 0.18 25)",
        badgeBg: "oklch(0.62 0.18 25 / 12%)",
        badgeText: "oklch(0.75 0.18 25)",
        barFill: "oklch(0.62 0.18 25)",
        label: "Full Burn-In Required",
        sublabel: "Anomalies detected — continue testing",
        icon: AlertTriangle,
      };

  const Icon = scheme.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="glass-card rounded-2xl overflow-hidden"
    >
      <div className="px-6 py-5 flex flex-col md:flex-row md:items-center gap-5">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: scheme.iconBg }}
        >
          {is_lot_fully_clear ? (
            <motion.div
              className="flex items-center justify-center"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            >
              <Icon className="w-6 h-6" style={{ color: scheme.iconColor }} />
            </motion.div>
          ) : (
            <Icon className="w-6 h-6" style={{ color: scheme.iconColor }} />
          )}
        </div>

        {/* Main text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-lg font-semibold tracking-tight"
              style={{ color: scheme.badgeText }}
            >
              {scheme.label}
            </span>
            {/* Confidence pill */}
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: scheme.badgeBg, color: scheme.badgeText }}
            >
              {confidencePct}% confidence
            </span>
          </div>
          <p className="text-sm text-muted-foreground/60 dark:text-muted-foreground font-light">
            {scheme.sublabel}
          </p>

          {/* Confidence bar */}
          <div className="mt-3 flex items-center gap-3">
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: "oklch(1 0 0 / 6%)" }}
            >
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${confidencePct}%` }}
                transition={{ duration: 0.9, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
                style={{ background: scheme.barFill }}
              />
            </div>
            <span
              className="text-xs font-mono tabular-nums font-medium"
              style={{ color: scheme.badgeText }}
            >
              {clearable_count}/{total_count} clear
            </span>
          </div>
        </div>

        {/* Savings metrics — the big number */}
        {clearable_count > 0 && (
          <div className="flex items-center gap-4 md:gap-6 flex-shrink-0">
            {/* Hours saved */}
            <div className="text-right">
              <motion.p
                className="text-3xl font-bold tabular-nums leading-none"
                style={{ color: scheme.iconColor }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                {hours_saved.toLocaleString()}
              </motion.p>
              <p className="text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium mt-0.5">
                hours saved
              </p>
            </div>

            <div
              className="w-px h-10 rounded-full"
              style={{ background: scheme.border }}
            />

            {/* Components freed */}
            <div className="text-right">
              <motion.p
                className="text-3xl font-bold tabular-nums leading-none"
                style={{ color: scheme.iconColor }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                {clearable_count}
              </motion.p>
              <p className="text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium mt-0.5">
                components freed
              </p>
            </div>

            {/* Zap icon for energy */}
            <div
              className="hidden lg:flex w-10 h-10 rounded-xl items-center justify-center"
              style={{ background: scheme.iconBg }}
            >
              <Zap className="w-5 h-5" style={{ color: scheme.iconColor }} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom context bar */}
      <div
        className="px-6 py-2 flex items-center gap-2 text-xs"
        style={{ borderTop: `1px solid ${scheme.border}`, background: "oklch(0 0 0 / 15%)" }}
      >
        <span className="text-muted-foreground/30 dark:text-muted-foreground uppercase tracking-widest font-medium">
          Module B decision at 24h checkpoint
        </span>
        <span className="text-muted-foreground/20 dark:text-muted-foreground">·</span>
        <span className="text-muted-foreground/30 dark:text-muted-foreground uppercase tracking-widest font-medium">
          144h remaining burn-in per component
        </span>
        {is_lot_fully_clear && (
          <>
            <span className="text-muted-foreground/20 dark:text-muted-foreground">·</span>
            <span className="font-semibold uppercase tracking-widest" style={{ color: scheme.badgeText }}>
              ✓ Both Module A & Module B agree
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// Main page
// ------------------------------------------------------------
export default function LotOverview() {
  const router = useRouter();

  useEffect(() => { document.title = "Lot Overview — LATENT"; }, []);
  const { data: lotsData, error: lotsError } = useSWR(`${API_URL}/api/lots/`, fetcher, swrOpts);
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  const allComponentsRaw = lotDetails?.components || [];
  const searchLower = searchQuery.toLowerCase();
  
  const allComponents = useMemo(() => {
    if (!searchQuery) return allComponentsRaw;
    return allComponentsRaw.filter((c: ComponentSummary) => 
      c.component_id?.toLowerCase().includes(searchLower) ||
      c.defect_type?.toLowerCase().includes(searchLower)
    );
  }, [allComponentsRaw, searchQuery, searchLower]);

  const flagged = allComponents.filter((c: ComponentSummary) => c.is_anomalous);
  const normal = allComponents.filter((c: ComponentSummary) => !c.is_anomalous);
  const latentCaught = flagged.filter((c: ComponentSummary) =>
    c.defect_type === "latent" ||
    (c.defect_type !== "normal" && c.leakage_median < 50 && c.delay_median < 18)
  ).length;

  const burnInSavings = lotDetails?.burn_in_savings ?? null;

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
        <p className="text-sm text-muted-foreground/60 dark:text-muted-foreground font-light">Could not reach the API server</p>
      </motion.div>
    );
  }

  if (isLoading) return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <div className="skeleton h-36 rounded-xl" />
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 6 * 0.05 }}
      >
        <div className="skeleton h-96 rounded-xl" />
      </motion.div>
    </div>
  );

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Lot Overview</h1>
          <p className="text-sm text-muted-foreground/60 dark:text-muted-foreground font-light">
            {allComponents.length} components screened · LATENT catches statistically abnormal parts that pass traditional static limits
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input 
              type="text" 
              placeholder="Search components..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 h-9 pl-9 pr-3 text-sm bg-transparent border border-border/10 rounded-xl glass-card outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            />
          </div>
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
      <motion.div variants={itemVariants} className="grid grid-cols-5 gap-3">
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
          {
            label: "Latent Caught",
            value: latentCaught,
            icon: TrendingDown,
            color: "oklch(0.65 0.14 55)",
            subtitle: "Missed by static rules"
          },
        ].map((stat: StatCard) => (
          <motion.div key={stat.label} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
            className="glass-card glass-card-hover rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <stat.icon className="w-4 h-4" style={{ color: stat.color, opacity: 0.6 }} />
              <span className="text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium">{stat.label}</span>
            </div>
            <p className="text-3xl font-bold tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
            {stat.subtitle && (
              <p className="text-xs font-medium mt-1" style={{ color: stat.color, opacity: 0.85 }}>{stat.subtitle}</p>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* ── Safe-to-End-Burn-In Banner ── */}
      <AnimatePresence mode="wait">
        {burnInSavings && (
          <motion.div key={selectedLot + "-savings"} variants={itemVariants}>
            <BurnInSavingsBanner savings={burnInSavings} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single hybrid scatter chart with filter */}
      <motion.div variants={itemVariants}>
        <div className="glass-card rounded-2xl p-6">
          {/* Chart header + filter controls */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-medium">Parametric Scatter</h3>
              <p className="text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium mt-0.5">
                Anomaly distribution by leakage &amp; delay — {allComponents.length} components
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
                    relative px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider
                    transition-all duration-300 flex items-center gap-1.5
                    ${filter === f.key
                      ? 'text-foreground/90'
                      : 'text-muted-foreground/40 dark:text-muted-foreground hover:text-foreground/50'
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
           <div className="flex items-center gap-5 mb-3 text-xs">
             <div className="flex items-center gap-1.5">
               <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(160, 165, 180, 0.7)", border: "1.5px solid rgba(160, 165, 180, 0.4)" }} />
               <span className="text-muted-foreground/60 dark:text-muted-foreground font-light">Normal</span>
             </div>
             <div className="flex items-center gap-1.5">
               <span className="w-2.5 h-2.5 rounded-full" style={{ background: "oklch(0.62 0.18 25)", border: "1.5px solid oklch(0.62 0.18 25 / 0.5)" }} />
               <span className="text-muted-foreground/60 dark:text-muted-foreground font-light">Anomalous</span>
             </div>
           </div>

          {/* Axis labels */}
          <div className="relative">
            {/* Y-axis label */}
            <div
              className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium"
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
                  isInteractable={(row: Record<string, unknown>) => {
                    if (filter === "all") return true;
                    if (filter === "anomalous") return !!row.is_anomalous;
                    return !row.is_anomalous;
                  }}
                  onRowClick={(row: Record<string, unknown>) => {
                    if (row.component_id) router.push(`/components/${row.component_id}`);
                  }}
                >
                  <Grid horizontal vertical />

                  <XAxis formatTick={(v) => `${Number(v).toFixed(1)} µA`} />
                  <YAxis formatTick={(v) => `${Number(v).toFixed(2)} ns`} />

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
                      const r = row as unknown as ComponentSummary;
                      const isAnom = r.is_anomalous;
                      const compId = r.component_id || "—";
                      const defectType = r.defect_type || "unknown";
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
                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: 'center', letterSpacing: '0.05em' }}>
                            Click to open deep-dive →
                          </div>
                        </div>
                      );
                    }}
                  />
                </ScatterChart>
              </motion.div>
            </AnimatePresence>

            {/* X-axis label */}
            <div className="text-center text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium mt-1">
              Iddq / Leakage Current (µA)
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filtered table */}
      <motion.div variants={itemVariants}>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/5 flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium">
                {filter === "all" ? "All Components" : filter === "anomalous" ? "Anomalous Components" : "Normal Components"}
              </h3>
              <p className="text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium mt-0.5">
                Showing {Math.min(TABLE_LIMIT, tableData.length)} of {tableData.length} — click to inspect
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/5">
                  <th className="px-6 py-3 text-xs font-medium text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest">Component</th>
                  <th className="px-6 py-3 text-xs font-medium text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest">Lot</th>
                  <th className="px-6 py-3 text-xs font-medium text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest">Defect Type</th>
                  <th className="px-6 py-3 text-xs font-medium text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest">Score</th>
                  <th className="px-6 py-3 text-xs font-medium text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest">Leakage (µA)</th>
                  <th className="px-6 py-3 text-xs font-medium text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest">Delay (ns)</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, TABLE_LIMIT).map((c: ComponentSummary, i: number) => (
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
                    <td className="px-6 py-3.5 font-mono text-sm text-foreground/70">{c.component_id}</td>
                    <td className="px-6 py-3.5 text-sm text-muted-foreground/50 dark:text-muted-foreground font-light">{c.lot_id}</td>
                    <td className="px-6 py-3">
                      {c.is_anomalous ? (
                        <span className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-md bg-destructive/10 text-destructive/80">
                          {c.defect_type}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-500/70 font-medium flex items-center gap-1">
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Pass
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-3.5 font-mono text-sm tabular-nums font-medium ${c.is_anomalous ? 'text-destructive/80' : 'text-muted-foreground/50 dark:text-muted-foreground'}`}>
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
                        <span className="text-xs text-muted-foreground/50 dark:text-muted-foreground font-light tabular-nums">{c.leakage_median?.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-16 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 4%)" }}>
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min((c.delay_median / 20) * 100, 100)}%`,
                            background: c.is_anomalous ? "oklch(0.62 0.18 25 / 0.6)" : "oklch(0.6 0.04 250 / 0.5)",
                          }} />
                        </div>
                        <span className="text-xs text-muted-foreground/50 dark:text-muted-foreground font-light tabular-nums">{c.delay_median?.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 dark:group-hover:text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5" />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-2 border-t border-border/5 flex items-center gap-2">
            <span className="text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium">
              Static datasheet limits:
            </span>
            <span className="text-xs text-muted-foreground/40 dark:text-muted-foreground uppercase tracking-widest font-medium">
              Leakage &lt; 50&nbsp;µA&nbsp;·&nbsp;Delay &lt; 18&nbsp;ns — LATENT catches outliers that pass these limits
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}