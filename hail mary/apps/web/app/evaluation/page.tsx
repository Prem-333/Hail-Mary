'use client';
import useSWR from "swr";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { TrendingUp, TrendingDown, Shield, AlertTriangle, Target, Crosshair } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

function AnimatedNumber({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="tabular-nums"
    >
      {decimals > 0 ? value.toFixed(decimals) : value}{suffix}
    </motion.span>
  );
}

function ProgressBar({ value, max = 1, color = "oklch(0.78 0.12 250)", delay = 0 }: { value: number; max?: number; color?: string; delay?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 5%)" }}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
        style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }}
      />
    </div>
  );
}

export default function EvaluationSummary() {
  const { data, isLoading, error } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/api/evaluation/`, fetcher, swrOpts);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } }
  };

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-destructive gap-3 p-8 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-destructive/30 flex items-center justify-center">
          <span className="text-xl">!</span>
        </div>
        <h2 className="text-xl font-bold">Network Error</h2>
        <p className="text-muted-foreground max-w-md">Could not connect to the backend API.</p>
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading evaluation…</span>
      </div>
    </div>
  );
  if (!data) return null;

  const am = data.anomaly_metrics;
  const dm = data.drift_metrics;
  const safety = data.safety_slope;

  const moduleACards = [
    { label: "F2-Score", value: am.f2_score, decimals: 4, icon: Target, color: "oklch(0.78 0.12 250)", max: 1 },
    { label: "Recall", value: am.recall, decimals: 1, suffix: "%", multiply: 100, icon: Crosshair, color: "oklch(0.7 0.16 160)", max: 1 },
    { label: "Precision", value: am.precision, decimals: 1, suffix: "%", multiply: 100, icon: TrendingUp, color: "oklch(0.72 0.14 300)", max: 1 },
    { label: "False Negatives", value: am.false_negatives, icon: AlertTriangle, color: am.false_negatives > 0 ? "oklch(0.65 0.22 25)" : "oklch(0.4 0 0)", danger: am.false_negatives > 0 },
    { label: "True Positives", value: am.true_positives, icon: Shield, color: "oklch(0.6 0.15 160)", extra: `/ ${am.total_defects}` },
  ];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      <div className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight">Evaluation Summary</h1>
        <p className="text-sm text-muted-foreground mt-0.5">End-to-end metrics for anomaly detection, drift prediction, and early rejection</p>
      </div>

      {/* Module A */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-4 rounded-full" style={{ background: "oklch(0.78 0.12 250)" }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Anomaly Detection · Module A</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {moduleACards.map((card, i) => {
            const Icon = card.icon;
            const displayVal = card.multiply ? card.value * card.multiply : card.value;
            return (
              <motion.div key={card.label} variants={itemVariants} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                <div className="rounded-lg p-4 h-full" style={{
                  background: card.danger
                    ? "linear-gradient(135deg, oklch(0.14 0.04 25) 0%, oklch(0.1 0 0) 100%)"
                    : "linear-gradient(135deg, var(--card) 0%, oklch(0.1 0 0) 100%)",
                  border: card.danger ? "1px solid oklch(0.65 0.22 25 / 20%)" : "1px solid oklch(1 0 0 / 6%)",
                }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <span className={`text-[10px] uppercase tracking-widest font-semibold ${card.danger ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                      {card.label}
                    </span>
                  </div>
                  <div className={`text-2xl font-bold mb-2 ${card.danger ? 'text-destructive' : ''}`}>
                    <AnimatedNumber value={displayVal} decimals={card.decimals ?? 0} suffix={card.suffix ?? ""} />
                    {card.extra && <span className="text-sm text-muted-foreground ml-1">{card.extra}</span>}
                  </div>
                  {card.max && <ProgressBar value={card.value} max={card.max} color={card.color} delay={i * 0.1} />}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Module B */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-3 mt-2">
          <div className="w-1.5 h-4 rounded-full" style={{ background: "oklch(0.7 0.16 160)" }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Drift Prediction · Module B</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(dm).map(([param, m]: [string, any], pi: number) => (
            <motion.div key={param} variants={itemVariants} whileHover={{ y: -2 }}>
              <div className="rounded-lg p-5 h-full" style={{
                background: "linear-gradient(135deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
                border: "1px solid oklch(1 0 0 / 6%)",
              }}>
                <h3 className="capitalize text-base font-semibold mb-4">{param.replace(/_/g, ' ')}</h3>

                <div className="grid grid-cols-2 gap-6 mb-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">XGBoost MAE</p>
                    <p className="text-xl font-bold tabular-nums">{m.xgb_mae?.toFixed(4)}</p>
                    <ProgressBar value={m.xgb_mae ?? 0} max={2} color="oklch(0.78 0.12 250)" delay={pi * 0.15} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Linear MAE</p>
                    <p className="text-xl font-bold tabular-nums">{m.linear_mae?.toFixed(4)}</p>
                    <ProgressBar value={m.linear_mae ?? 0} max={2} color="oklch(0.65 0.18 30)" delay={pi * 0.15 + 0.05} />
                  </div>
                </div>

                <div className="border-t border-border/20 pt-3 space-y-2.5">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Per-Class MAE</span>
                  {[
                    { label: "Normal", value: m.xgb_mae_normal, color: "oklch(0.5 0 0)" },
                    { label: "Latent", value: m.xgb_mae_latent, color: "oklch(0.72 0.14 300)" },
                    { label: "Obvious", value: m.xgb_mae_obvious, color: "oklch(0.65 0.18 30)" },
                  ].map((row, ri) => (
                    <div key={row.label}>
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-mono tabular-nums font-medium">{row.value?.toFixed(4) || "N/A"}</span>
                      </div>
                      {row.value != null && <ProgressBar value={row.value} max={2} color={row.color} delay={pi * 0.15 + ri * 0.05} />}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Safety-Slope */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-3 mt-2">
          <div className="w-1.5 h-4 rounded-full" style={{ background: "oklch(0.65 0.18 30)" }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Safety-Slope · Early Rejection</h2>
        </div>
        <div className="rounded-lg overflow-hidden" style={{
          background: "linear-gradient(135deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/20">
                <th className="px-5 py-3 font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">Class</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">Total</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">Flagged at 24h</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground text-[10px] uppercase tracking-widest w-[40%]">Flag Rate</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {safety.map((s: any, si: number) => (
                <motion.tr
                  key={s.class}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + si * 0.08 }}
                  className="hover:bg-accent/15 border-b border-border/10 last:border-0 transition-colors group"
                >
                  <td className="px-5 py-3.5 font-sans font-medium">{s.class}</td>
                  <td className="px-5 py-3.5 tabular-nums text-muted-foreground">{s.total}</td>
                  <td className="px-5 py-3.5 font-bold tabular-nums" style={{ color: "oklch(0.78 0.12 250)" }}>{s.flagged}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-sm w-12">{(s.flag_rate * 100).toFixed(1)}%</span>
                      <div className="flex-1">
                        <ProgressBar value={s.flag_rate} max={1} color={s.flag_rate > 0.5 ? "oklch(0.65 0.22 25)" : "oklch(0.5 0 0)"} delay={0.4 + si * 0.1} />
                      </div>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
