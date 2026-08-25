'use client';
import useSWR from "swr";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart } from "recharts";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

export default function ComponentDeepDive() {
  const { id } = useParams();
  const router = useRouter();
  const { data, isLoading, error } = useSWR(`http://127.0.0.1:8000/api/components/${id}`, fetcher, swrOpts);

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
          background: "linear-gradient(180deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
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
                    background: "oklch(0.1 0 0)",
                    border: "1px solid oklch(1 0 0 / 6%)",
                  }}>
                    <h4 className="font-semibold text-sm mb-4 capitalize text-center text-muted-foreground">{param.replace(/_/g, ' ')}</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(1 0 0 / 8%)" />
                        <XAxis dataKey="time" name="Hours" tick={{ fill: 'oklch(0.5 0 0)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: 'oklch(0.5 0 0)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--popover)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 12,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                          }}
                          labelStyle={{ color: 'var(--popover-foreground)' }}
                          itemStyle={{ color: 'var(--popover-foreground)' }}
                        />
                        <Area type="monotone" dataKey="max" stroke="none" fill="oklch(0.78 0.12 250 / 15%)" />
                        <Area type="monotone" dataKey="min" stroke="none" fill="oklch(0.085 0 0)" fillOpacity={1} />
                        <Line type="monotone" dataKey="val" stroke="oklch(0.78 0.12 250)" strokeWidth={2.5} dot={{ r: 5, fill: 'oklch(0.78 0.12 250)', strokeWidth: 0 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
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
          <Card className="h-full" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <CardHeader>
              <CardTitle>Anomaly Detection (Module A)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-4 rounded-lg border-l-4 ${
                anomaly.is_anomalous 
                  ? 'border-destructive bg-destructive/10 text-destructive' 
                  : 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
              }`}>
                <p className="font-bold">{anomaly.is_anomalous ? "ANOMALOUS" : "Normal"}</p>
                <p className="text-sm opacity-80">Score: {anomaly.anomaly_score?.toFixed(2)}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 text-sm text-muted-foreground">Justification</h4>
                <p className="text-sm bg-muted/30 p-3 rounded-lg border border-border/30">{anomaly.justification || "N/A"}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="h-full" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <CardHeader>
              <CardTitle>Drift Prediction (Module B)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {drift.flagged_for_rejection ? (
                <div className="p-4 rounded-lg border-l-4 border-amber-500 bg-amber-500/10 text-amber-400">
                  <p className="font-bold">Safety-slope flag triggered</p>
                  <p className="text-sm opacity-80">Max implied drift rate exceeds lot threshold.</p>
                </div>
              ) : (
                <div className="p-4 rounded-lg border-l-4 border-emerald-500 bg-emerald-500/10 text-emerald-400">
                  <p className="font-bold">Safety-slope check: PASSED</p>
                </div>
              )}
              
              <div className="text-sm rounded-lg overflow-hidden border border-border/30">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="p-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">Parameter</th>
                      <th className="p-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">Predicted 168h</th>
                      <th className="p-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">Residual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(drift.per_parameter || {}).map(([param, pinfo]: [string, any]) => (
                      <tr key={param} className="border-b border-border/20 last:border-0">
                        <td className="p-3 capitalize">{param.replace(/_/g, ' ')}</td>
                        <td className="p-3 font-mono tabular-nums">{pinfo.predicted_168h_xgb?.toFixed(2)}</td>
                        <td className="p-3 font-mono tabular-nums">{pinfo.residual ? (pinfo.residual > 0 ? '+' : '') + pinfo.residual.toFixed(2) : "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      
      {/* Final Assessment */}
      <motion.div variants={itemVariants}>
        <Card style={{
          background: "linear-gradient(135deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <CardHeader>
            <CardTitle>Final AI Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base leading-relaxed text-foreground/80">{report.recommendation_text}</p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
