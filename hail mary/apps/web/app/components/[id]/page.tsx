'use client';
import { useEffect } from "react";
import useSWR from "swr";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@workspace/ui/components/button";
import { ArrowLeft, AlertTriangle, CheckCircle, TrendingUp, Eye, Sparkles } from "lucide-react";
import { Gauge } from "@workspace/ui/components/charts/gauge";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

function parseJustification(text: string): string[] {
  if (!text) return [];
  const sentences = text.split(/\.\s+/).filter(s => s.trim().length > 0);
  return sentences.map(s => s.trim() + (s.endsWith('.') ? '' : '.'));
}

export default function ComponentDeepDive() {
  const { id } = useParams();
  const router = useRouter();
  const { data, isLoading, error } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/api/components/${id}`, fetcher, swrOpts);

  useEffect(() => {
    if (id) document.title = `Component ${id} — LATENT`;
    return () => { document.title = "LATENT — Burn-In Screening · ISRO"; };
  }, [id]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-destructive gap-3 p-8 text-center">
        <h2 className="text-xl font-bold">Error loading component</h2>
        <p className="text-muted-foreground">Could not connect to the backend API.</p>
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading component…</span>
      </div>
    </div>
  );

  if (!data) return <div className="text-muted-foreground text-center py-12">Component not found</div>;

  const { report, trajectories } = data;
  const anomaly = report.anomaly || {};
  const drift = report.drift || {};

  // Compute drift ratio for the most-flagged parameter
  const driftRatioText = (() => {
    if (!drift.per_parameter) return null;
    let worstRatio = 0;
    let worstLabel = "";
    for (const [param, pinfo] of Object.entries(drift.per_parameter) as [string, any][]) {
      if (pinfo.implied_drift && pinfo.safety_slope) {
        const ratio = pinfo.implied_drift / pinfo.safety_slope;
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstLabel = param.includes("leak") ? "Leakage" : "Delay";
        }
      }
    }
    if (worstRatio > 1) return `${worstLabel} drift rate is ${worstRatio.toFixed(1)}× above lot safety-slope threshold`;
    return null;
  })();

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Back + Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-4 mb-1">
        <Button variant="outline" size="icon" onClick={() => router.back()} className="border-border/50 hover:bg-accent/40">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Component: {data.component_id}</h1>
          <p className="text-sm text-muted-foreground">
            Lot: {data.lot_id} · Ground truth: <span className="font-medium text-foreground/70">{data.defect_type}</span>
          </p>
        </div>
        <div className="ml-auto">
          <span className={`px-4 py-2 text-sm rounded-md font-bold ${
            report.recommendation === 'REJECT'
              ? 'bg-destructive/20 text-destructive border border-destructive/30'
              : report.recommendation === 'ACCEPT'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
          }`}>
            {report.recommendation}
          </span>
        </div>
      </motion.div>

      {/* AI Assessment */}
      <motion.div variants={itemVariants}>
        <div className="rounded-xl p-6" style={{
          background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-muted-foreground/50" />
            <h3 className="text-base font-semibold">AI Disposition Summary</h3>
          </div>
          <div className="space-y-3">
            {parseJustification(report.recommendation_text || "").map((point, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="text-muted-foreground/50 mt-2 text-xs shrink-0">•</span>
                <p className="text-sm leading-relaxed text-foreground/80 flex-1 font-light">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Parametric Trajectory */}
      <motion.div variants={itemVariants}>
        <div className="rounded-xl p-6" style={{
          background: "linear-gradient(180deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-muted-foreground/50" />
            <h3 className="text-base font-semibold">Parametric Trajectory</h3>
            <span className="text-xs text-muted-foreground/40 font-light">— vs batch envelope (±2 MAD)</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(trajectories).map(([param, tr]: [string, any]) => {
              const hours = [0, 24, 96, 168];
              const baseDate = new Date('2024-01-01T00:00:00Z');
              const chartData = hours.map((time, idx) => ({
                time: new Date(baseDate.getTime() + time * 60 * 60 * 1000),
                val: tr.values[idx],
                lo: tr.envelope.lo[idx],
                hi: tr.envelope.hi[idx],
                med: tr.envelope.meds[idx],
              }));

              const unit = param.includes("leak") ? "µA" : "ns";
              const label = param.includes("leak") ? "Leakage Current (µA)" : "Propagation Delay (ns)";
              const finalVal = tr.values[3];
              const finalMed = tr.envelope.meds[3];
              const deviation = finalMed > 0 ? ((finalVal - finalMed) / finalMed * 100) : 0;
              const isOutlier = Math.abs(deviation) > 20;

              return (
                <div key={param}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest">{label}</h4>
                    {isOutlier && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive/70 border border-destructive/20 font-medium">
                        {deviation > 0 ? "+" : ""}{deviation.toFixed(0)}% vs batch median
                      </span>
                    )}
                  </div>
                  <div className="h-[260px] rounded-lg p-4" style={{
                    background: "oklch(0.09 0.004 260)",
                    border: "1px solid oklch(1 0 0 / 6%)",
                  }}>
                    <LineChart
                      data={chartData}
                      xDataKey="time"
                      margin={{ top: 16, right: 20, bottom: 40, left: 75 }}
                      dateLabels={["0h", "24h", "96h", "168h"]}
                    >
                      <Grid horizontal />
                      {/* Batch envelope */}
                      <Line dataKey="hi" stroke="oklch(1 0 0 / 8%)" strokeWidth={1} />
                      <Line dataKey="lo" stroke="oklch(1 0 0 / 8%)" strokeWidth={1} />
                      {/* Batch median */}
                      <Line dataKey="med" stroke="oklch(0.6 0.04 250 / 40%)" strokeWidth={1.5} />
                      {/* This component */}
                      <Line dataKey="val" stroke="var(--chart-1)" strokeWidth={2.5} />
                      <XAxis numTicks={4} />
                      <YAxis formatValue={(v: number) => `${v.toFixed(1)} ${unit}`} />
                      <ChartTooltip />
                    </LineChart>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground/40">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded" style={{ background: "var(--chart-1)" }} />
                      <span>This component</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded opacity-40" style={{ background: "oklch(0.6 0.04 250)", borderTop: "1px dashed" }} />
                      <span>Batch median</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded opacity-20" style={{ background: "white", borderTop: "1px dashed" }} />
                      <span>±2 MAD envelope</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Module A & B */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module A — Anomaly Detection */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl h-full flex flex-col" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="px-5 pt-5 pb-3 border-b border-border/10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                  style={{ background: "oklch(0.62 0.18 25 / 12%)", color: "oklch(0.62 0.18 25)", border: "1px solid oklch(0.62 0.18 25 / 20%)" }}>
                  Module A
                </span>
                <h3 className="text-sm font-semibold">Anomaly Detection</h3>
              </div>
            </div>
            <div className="p-5 space-y-5 flex-1">
              <div className={`p-4 rounded-xl flex items-center gap-3 ${
                anomaly.is_anomalous
                  ? 'bg-destructive/10 border border-destructive/30'
                  : 'bg-emerald-500/10 border border-emerald-500/30'
              }`}>
                {anomaly.is_anomalous ? (
                  <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
                ) : (
                  <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                )}
                <div>
                  <p className={`font-bold text-lg ${anomaly.is_anomalous ? 'text-destructive' : 'text-emerald-400'}`}>
                    {anomaly.is_anomalous ? 'ANOMALOUS' : 'Normal'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Score: <span className="font-mono tabular-nums">{anomaly.anomaly_score?.toFixed(1) || '0.0'}</span> / 25
                  </p>
                </div>
              </div>

              {/* Gauge */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-full max-w-[240px]">
                  <Gauge
                    value={Math.min(((anomaly.anomaly_score || 0) / 25) * 100, 100)}
                    centerValue={anomaly.anomaly_score || 0}
                    defaultLabel="Anomaly Score"
                    spacing={20}
                    inactiveFillOpacity={0.2}
                    activeFill={anomaly.is_anomalous ? "var(--destructive)" : "var(--chart-2)"}
                    useGradient={false}
                    enterTransition={{ stiffness: 100, damping: 25 }}
                    enterStaggerScale={1.5}
                    formatOptions={{ maximumFractionDigits: 1 }}
                  />
                </div>
              </div>

              {/* Justification */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="w-3 h-3 text-muted-foreground/40" />
                  <h4 className="font-semibold text-xs text-muted-foreground/60 uppercase tracking-widest">Why Flagged</h4>
                </div>
                <div className="bg-muted/20 p-4 rounded-xl border border-border/20 space-y-2.5">
                  {parseJustification(anomaly.justification || "").length > 0 ? (
                    parseJustification(anomaly.justification).map((point, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <span className={`mt-1 text-xs shrink-0 ${anomaly.is_anomalous ? 'text-destructive/60' : 'text-emerald-500/60'}`}>
                          {anomaly.is_anomalous ? '⚠' : '✓'}
                        </span>
                        <p className="text-sm leading-relaxed flex-1">{point}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground/60">N/A</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Module B — Drift Prediction */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl h-full flex flex-col" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="px-5 pt-5 pb-3 border-b border-border/10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                  style={{ background: "oklch(0.7 0.05 250 / 12%)", color: "oklch(0.7 0.05 250)", border: "1px solid oklch(0.7 0.05 250 / 20%)" }}>
                  Module B
                </span>
                <h3 className="text-sm font-semibold">Drift Prediction</h3>
              </div>
            </div>
            <div className="p-5 space-y-5 flex-1">
              <div className={`p-4 rounded-xl ${drift.flagged_for_rejection ? 'bg-destructive/10 border border-destructive/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                <div className="flex items-center gap-3">
                  {drift.flagged_for_rejection ? (
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <p className={`font-bold text-base ${drift.flagged_for_rejection ? 'text-destructive' : 'text-emerald-400'}`}>
                      Safety-slope: {drift.flagged_for_rejection ? 'REJECTED' : 'PASSED'}
                    </p>
                    {driftRatioText && (
                      <p className="text-xs text-destructive/70 mt-0.5 font-medium">{driftRatioText}</p>
                    )}
                    {!drift.flagged_for_rejection && (
                      <p className="text-xs text-emerald-400/70 mt-0.5 font-light">Drift rate within lot-specific safety-slope threshold</p>
                    )}
                  </div>
                </div>
                {drift.flagged_for_rejection && (
                  <div className="mt-4 pt-4 border-t border-destructive/20 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground/60 text-xs uppercase tracking-wider mb-1">Implied Drift</p>
                      <p className="font-mono tabular-nums text-destructive font-semibold">{drift.max_implied_drift?.toFixed(4) || 'N/A'}/h</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60 text-xs uppercase tracking-wider mb-1">Lot Threshold</p>
                      <p className="font-mono tabular-nums">{drift.max_safety_slope?.toFixed(4) || 'N/A'}/h</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Per-parameter table */}
              <div>
                <h4 className="font-semibold mb-3 text-xs text-muted-foreground/60 uppercase tracking-widest">Per-Parameter Forecast</h4>
                <div className="rounded-xl overflow-hidden border border-border/30">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/10">
                        <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">Parameter</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">Pred 168h</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest text-right">Drift Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(drift.per_parameter || {}).map(([param, pinfo]: [string, any]) => {
                        const ratio = pinfo.implied_drift && pinfo.safety_slope
                          ? (pinfo.implied_drift / pinfo.safety_slope)
                          : null;
                        const isOver = ratio !== null && ratio > 1;
                        const unit = param.includes("leak") ? "µA" : "ns";
                        return (
                          <tr key={param} className="border-b border-border/20 last:border-0">
                            <td className="px-4 py-3 capitalize text-sm text-muted-foreground/70">{param.replace(/_/g, ' ').replace('u a', 'µA').replace(' n s', ' ns')}</td>
                            <td className="px-4 py-3 font-mono tabular-nums text-sm">
                              {pinfo.predicted_168h_xgb?.toFixed(3)} {unit}
                            </td>
                            <td className="px-4 py-3 font-mono tabular-nums text-sm text-right">
                              {ratio !== null ? (
                                <span className={`font-semibold ${isOver ? 'text-destructive' : 'text-emerald-400/80'}`}>
                                  {ratio.toFixed(2)}×
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground/35 mt-1.5 font-light text-right">Drift Ratio = implied drift ÷ lot safety-slope threshold</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
}
