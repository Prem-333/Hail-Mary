'use client';
import { useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Gauge } from "@workspace/ui/components/charts/gauge";
import { Zap, FlaskConical, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";

export default function SimulatorPage() {
  const [formData, setFormData] = useState({
    lot_id: "LOT_000",
    leak_0h: 17.0,
    leak_24h: 17.2,
    delay_0h: 8.0,
    delay_24h: 8.04
  });

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("http://127.0.0.1:8000/api/simulate/", formData);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to run simulation. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'lot_id' ? value : parseFloat(value) }));
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } }
  };

  const inputClass = "w-full mt-1.5 px-3 py-2.5 rounded-lg text-sm transition-all focus:outline-none focus:ring-1 focus:ring-ring/40 bg-[oklch(0.1_0_0)] border border-border/40 placeholder:text-muted-foreground/40 tabular-nums";

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      <div className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight">Rejection Simulator</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Predict 168h drift from 0h and 24h readings · Real-time safety-slope check</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Input panel */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="rounded-lg p-5 h-full" style={{
            background: "linear-gradient(180deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="h-4 w-4 text-muted-foreground/50" />
              <h3 className="font-semibold">Input Measurements</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Lot ID</label>
                <input name="lot_id" value={formData.lot_id} onChange={handleChange} className={inputClass} />
              </div>

              <div className="pt-3 border-t border-border/20">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Leakage Current (µA)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground/60 uppercase">0h</label>
                    <input type="number" step="0.1" name="leak_0h" value={formData.leak_0h} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground/60 uppercase">24h</label>
                    <input type="number" step="0.1" name="leak_24h" value={formData.leak_24h} onChange={handleChange} className={inputClass} />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/20">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Propagation Delay (ns)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground/60 uppercase">0h</label>
                    <input type="number" step="0.1" name="delay_0h" value={formData.delay_0h} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground/60 uppercase">24h</label>
                    <input type="number" step="0.1" name="delay_24h" value={formData.delay_24h} onChange={handleChange} className={inputClass} />
                  </div>
                </div>
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                <Button type="submit" className="w-full mt-2 h-11 font-semibold text-sm gap-2" disabled={loading}
                  style={{
                    background: "linear-gradient(135deg, oklch(0.22 0 0) 0%, oklch(0.16 0 0) 100%)",
                    border: "1px solid oklch(1 0 0 / 10%)",
                  }}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                      Simulating…
                    </>
                  ) : (
                    <>
                      Run Simulation <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </motion.div>

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-destructive text-xs text-center">{error}</motion.p>
              )}
            </form>
          </div>
        </motion.div>

        {/* Results panel */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <div className="rounded-lg h-full" style={{
            background: "linear-gradient(180deg, var(--card) 0%, oklch(0.095 0 0) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="p-5 border-b border-border/10">
              <h3 className="font-semibold">Simulation Results</h3>
            </div>

            <div className="p-5">
              <AnimatePresence mode="wait">
                {!result && !loading && (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{
                      background: "linear-gradient(135deg, oklch(0.15 0 0), oklch(0.12 0 0))",
                      border: "1px solid oklch(1 0 0 / 6%)",
                    }}>
                      <FlaskConical className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                    <p className="text-muted-foreground/50 text-sm">Enter parameters and run a simulation</p>
                    <p className="text-muted-foreground/30 text-xs mt-1">Results will appear here</p>
                  </motion.div>
                )}

                {loading && (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16"
                  >
                    <div className="w-10 h-10 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground">Processing physics model…</p>
                  </motion.div>
                )}

                {result && !loading && (
                  <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                    {/* Status badge */}
                    <div className="flex items-center justify-between p-4 rounded-lg" style={{
                      background: result.is_flagged ? "oklch(0.13 0.04 25)" : "oklch(0.12 0.03 160)",
                      border: result.is_flagged ? "1px solid oklch(0.65 0.22 25 / 25%)" : "1px solid oklch(0.6 0.15 160 / 25%)",
                    }}>
                      <div className="flex items-center gap-3">
                        {result.is_flagged ? (
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-emerald-400" />
                        )}
                        <div>
                          <h4 className="font-semibold text-sm">Safety-Slope Status</h4>
                          <p className="text-xs text-muted-foreground">Drift rate vs lot threshold</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                        result.is_flagged
                          ? 'bg-destructive/20 text-destructive border border-destructive/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {result.is_flagged ? 'REJECT' : 'PASS'}
                      </span>
                    </div>

                    {/* Gauge cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(result.results).map(([param, data]: [string, any]) => {
                        const percentOfThreshold = Math.min((data.implied_drift / data.threshold) * 100, 150);
                        const isDanger = data.implied_drift > data.threshold;

                        return (
                          <motion.div key={param} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            className="rounded-lg p-4" style={{
                              background: "oklch(0.1 0 0)",
                              border: "1px solid oklch(1 0 0 / 5%)",
                            }}
                          >
                            <h4 className="text-xs font-medium uppercase tracking-widest text-center text-muted-foreground mb-3 capitalize">
                              {param.replace(/_/g, ' ')}
                            </h4>
                            <div className="h-[160px] flex justify-center items-center relative">
                              <Gauge value={percentOfThreshold} max={150} showAnimation={true} />
                              <div className="absolute flex flex-col items-center top-[55%]">
                                <span className={`text-lg font-bold tabular-nums ${isDanger ? 'text-destructive' : 'text-emerald-400'}`}>
                                  {data.implied_drift.toFixed(4)}/h
                                </span>
                                <span className="text-[10px] text-muted-foreground/60 uppercase">Drift Rate</span>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-border/20 text-xs text-center text-muted-foreground">
                              Threshold: <span className="font-mono tabular-nums text-foreground/60">{data.threshold.toFixed(4)}/h</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
