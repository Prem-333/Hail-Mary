'use client';
import useSWR from "swr";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { ArrowLeft, AlertTriangle, CheckCircle } from "lucide-react";
import { Gauge } from "@workspace/ui/components/charts/gauge";
import { LineChart, Line } from "@/components/charts/line-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
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

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex items-center gap-4 mb-1">
        <Button variant="outline" size="icon" onClick={() => router.back()} className="border-border/50 hover:bg-accent/40">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Component: {data.component_id}</h1>
          <p className="text-sm text-muted-foreground">Lot: {data.lot_id} · Ground truth: <span className="font-medium text-foreground/70">{data.defect_type}</span></p>
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
      </div>

      {/* Parametric Trajectory */}
      <motion.div variants={itemVariants}>
        <Card style={{
          background: "linear-gradient(180deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <CardHeader>
            <CardTitle>Parametric Trajectory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(trajectories).map(([param, tr]: [string, any]) => {
                const chartData = [0, 24, 96, 168].map((time, idx) => ({
                  time,
                  val: tr.values[idx],
                  min: tr.envelope.lo[idx],
                  max: tr.envelope.hi[idx]
                }));
                
                return (
                  <div key={param} className="h-[300px] rounded-lg p-4" style={{
                    background: "oklch(0.09 0.004 260)",
                    border: "1px solid oklch(1 0 0 / 6%)",
                  }}>
                    <h4 className="font-semibold text-sm mb-4 capitalize text-center text-muted-foreground">{param.replace(/_/g, ' ')}</h4>
                    <LineChart data={chartData} xDataKey="time">
                      <Grid horizontal />
                      <Line dataKey="val" stroke="var(--chart-1)" strokeWidth={2} />
                      <XAxis />
                      <ChartTooltip />
                    </LineChart>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Module A & B */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="h-full flex flex-col" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Anomaly Detection (Module A)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 flex-1">
              <div className={`p-5 rounded-xl flex items-center gap-3 ${
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

              <div className="flex flex-col items-center justify-center py-2">
                <div className="w-full max-w-[260px]">
                  <Gauge
                    value={Math.min(((anomaly.anomaly_score || 0) / 25) * 100, 100)}
                    centerValue={anomaly.anomaly_score || 0}
                    defaultLabel="Anomaly Score"
                    spacing={20}
                    inactiveFillOpacity={0.2}
                    activeFill={anomaly.is_anomalous ? "var(--destructive)" : "var(--chart-2)"}
                    useGradient={false}
                    formatOptions={{
                      maximumFractionDigits: 1,
                    }}
                  />
                </div>
              </div>

              <div className="pt-1">
                <h4 className="font-semibold mb-3 text-xs text-muted-foreground/60 uppercase tracking-widest">Justification</h4>
                <div className="bg-muted/20 p-4 rounded-xl border border-border/20 space-y-2.5">
                  {parseJustification(anomaly.justification || "").length > 0 ? (
                    parseJustification(anomaly.justification).map((point, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <span className="text-muted-foreground/50 mt-1.5 text-xs leading-none">•</span>
                        <p className="text-sm leading-relaxed flex-1">{point}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground/60">N/A</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="h-full flex flex-col" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Drift Prediction (Module B)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 flex-1">
              <div className={`p-5 rounded-xl ${drift.flagged_for_rejection ? 'bg-destructive/10 border border-destructive/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                <div className="flex items-center gap-3">
                  {drift.flagged_for_rejection ? (
                    <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <p className={`font-bold text-lg ${drift.flagged_for_rejection ? 'text-destructive' : 'text-emerald-400'}`}>
                      Safety-slope: {drift.flagged_for_rejection ? 'REJECTED' : 'PASSED'}
                    </p>
                    {drift.flagged_for_rejection && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">Max implied drift exceeds lot threshold</p>
                    )}
                  </div>
                </div>
                {drift.flagged_for_rejection && (
                  <div className="mt-4 pt-4 border-t border-destructive/20 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground/60 text-xs uppercase tracking-wider mb-1">Implied Drift</p>
                      <p className="font-mono tabular-nums text-destructive">{drift.max_implied_drift?.toFixed(4) || 'N/A'}/h</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60 text-xs uppercase tracking-wider mb-1">Threshold</p>
                      <p className="font-mono tabular-nums">{drift.max_safety_slope?.toFixed(4) || 'N/A'}/h</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="font-semibold mb-3 text-xs text-muted-foreground/60 uppercase tracking-widest">Per-Parameter Forecast</h4>
                <div className="rounded-xl overflow-hidden border border-border/30">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/10">
                        <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">Parameter</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">Pred 168h</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest text-right">Residual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(drift.per_parameter || {}).map(([param, pinfo]: [string, any]) => (
                        <tr key={param} className="border-b border-border/20 last:border-0">
                          <td className="px-4 py-3 capitalize text-sm">{param.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-sm">{pinfo.predicted_168h_xgb?.toFixed(2)}</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-sm text-right">{pinfo.residual ? (pinfo.residual > 0 ? '+' : '') + pinfo.residual.toFixed(2) : "N/A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      
      {/* Final Assessment */}
      <motion.div variants={itemVariants}>
        <Card style={{
          background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <CardHeader>
            <CardTitle>Final AI Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {parseJustification(report.recommendation_text || "").map((point, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <span className="text-muted-foreground/50 mt-2 text-xs">•</span>
                  <p className="text-base leading-relaxed text-foreground/80 flex-1 font-light">{point}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
