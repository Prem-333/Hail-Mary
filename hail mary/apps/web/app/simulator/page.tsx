'use client';
import { useState, useEffect } from "react";
import useSWR from "swr";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Gauge } from "@workspace/ui/components/charts/gauge";
import NumberFlow from "@number-flow/react";
import { Zap, FlaskConical, ArrowRight, AlertTriangle, CheckCircle, RotateCcw } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

export default function SimulatorPage() {
  const { data: lotsData } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/api/lots/`, fetcher, swrOpts);

  useEffect(() => { document.title = "Rejection Simulator — LATENT"; }, []);

  const defaultForm = {
    lot_id: "",
    leak_0h: 17.0,
    leak_24h: 17.2,
    delay_0h: 8.0,
    delay_24h: 8.04
  };

  const [formData, setFormData] = useState(defaultForm);

  // Initialize lot_id from the API once data loads
  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !formData.lot_id) {
      setFormData(prev => ({ ...prev, lot_id: lotsData.lots[0] }));
    }
  }, [lotsData, formData.lot_id]);

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animateValues, setAnimateValues] = useState(false);

  useEffect(() => {
    if (result && !loading) {
      setAnimateValues(false);
      const t = setTimeout(() => setAnimateValues(true), 300);
      return () => clearTimeout(t);
    }
  }, [result, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/simulate/`, formData);
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

  const handleClear = () => {
    setResult(null);
    setError(null);
    setFormData(prev => ({ ...defaultForm, lot_id: prev.lot_id }));
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } }
  };

  const inputClass = "w-full mt-1.5 px-3 py-2.5 rounded-lg text-sm transition-all focus:outline-none focus:ring-1 focus:ring-ring/40 bg-[oklch(0.09_0.004_260)] border border-border/40 placeholder:text-muted-foreground/40 tabular-nums";

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      <div className="mb-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rejection Simulator</h1>
        <p className="text-sm text-muted-foreground/60 mt-1 font-light">
          Enter early burn-in readings to predict 168h drift behaviour
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Input panel */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="rounded-lg p-5 h-full" style={{
            background: "linear-gradient(180deg, var(--card) 0%, oklch(0.085 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="h-4 w-4 text-muted-foreground/50" />
              <h3 className="font-semibold text-sm">Input Measurements</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Lot ID Selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Lot ID</label>
                <div className="mt-1.5">
                  <Select
                    value={formData.lot_id}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, lot_id: v ?? "" }))}
                  >
                    <SelectTrigger className="w-full bg-[oklch(0.09_0.004_260)] border-border/40 h-10 text-sm">
                      <SelectValue placeholder="Select Lot" />
                    </SelectTrigger>
                    <SelectContent>
                      {lotsData?.lots?.map((lot: string) => (
                        <SelectItem key={lot} value={lot}>{lot}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Leakage Current */}
              <div className="pt-3 border-t border-border/20">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Leakage Current (&micro;A)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground/70 uppercase font-medium">0 h reading</label>
                    <input
                      type="number" step="0.1" name="leak_0h"
                      value={formData.leak_0h} onChange={handleChange}
                      className={inputClass}
                      placeholder="e.g. 17.0"
                    />
                    <p className="text-xs text-muted-foreground/40 mt-1 font-light">Typical: 15 – 25 µA</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground/70 uppercase font-medium">24 h reading</label>
                    <input
                      type="number" step="0.1" name="leak_24h"
                      value={formData.leak_24h} onChange={handleChange}
                      className={inputClass}
                      placeholder="e.g. 17.2"
                    />
                    <p className="text-xs text-muted-foreground/40 mt-1 font-light">Must be ≥ 0 h value</p>
                  </div>
                </div>
              </div>

              {/* Propagation Delay */}
              <div className="pt-3 border-t border-border/20">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Propagation Delay (ns)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground/70 uppercase font-medium">0 h reading</label>
                    <input
                      type="number" step="0.01" name="delay_0h"
                      value={formData.delay_0h} onChange={handleChange}
                      className={inputClass}
                      placeholder="e.g. 8.0"
                    />
                    <p className="text-xs text-muted-foreground/40 mt-1 font-light">Typical: 7 – 12 ns</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground/70 uppercase font-medium">24 h reading</label>
                    <input
                      type="number" step="0.01" name="delay_24h"
                      value={formData.delay_24h} onChange={handleChange}
                      className={inputClass}
                      placeholder="e.g. 8.04"
                    />
                    <p className="text-xs text-muted-foreground/40 mt-1 font-light">Must be ≥ 0 h value</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button
                    type="submit"
                    className="w-full h-11 font-medium text-sm gap-2 glass-card"
                    disabled={loading || !formData.lot_id}
                    style={{
                      background: "linear-gradient(135deg, oklch(1 0 0 / 6%) 0%, oklch(1 0 0 / 2%) 100%)",
                      border: "1px solid oklch(1 0 0 / 10%)",
                      boxShadow: "inset 0 1px 0 oklch(1 0 0 / 8%), 0 4px 16px oklch(0 0 0 / 15%)",
                    }}
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                        <span className="text-foreground/80">Running…</span>
                      </>
                    ) : (
                      <>
                        <span className="text-foreground/90">Run Simulation</span>
                        <ArrowRight className="h-4 w-4 text-foreground/60" />
                      </>
                    )}
                  </Button>
                </motion.div>

                {result && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 glass-card rounded-lg"
                      onClick={handleClear}
                      title="Clear results and reset inputs"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
              </div>

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-destructive text-xs text-center">
                  {error}
                </motion.p>
              )}
            </form>
          </div>
        </motion.div>

        {/* Results panel */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <div className="rounded-lg h-full" style={{
            background: "linear-gradient(180deg, var(--card) 0%, oklch(0.085 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="p-5 border-b border-border/10">
              <h3 className="font-semibold text-sm">Simulation Results</h3>
              <p className="text-xs text-muted-foreground/50 font-light mt-0.5">
                Predicted 168 h drift rate vs lot-specific safety-slope threshold
              </p>
            </div>

            <div className="p-5">
              <AnimatePresence mode="wait">
                {!result && !loading && (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{
                      background: "linear-gradient(135deg, oklch(0.14 0.005 260), oklch(0.1 0.004 260))",
                      border: "1px solid oklch(1 0 0 / 6%)",
                    }}>
                      <FlaskConical className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                    <p className="text-foreground/80 text-base font-medium">Enter readings and run a simulation</p>
                    <p className="text-muted-foreground/50 text-sm mt-1 font-light">Results will appear here</p>
                  </motion.div>
                )}

                {loading && (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16"
                  >
                    <div className="w-10 h-10 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground font-light">Running simulation…</p>
                  </motion.div>
                )}

                {result && !loading && (
                  <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                    {/* Status badge */}
                    <div className="flex items-center justify-between p-4 rounded-lg" style={{
                      background: result.is_flagged ? "oklch(0.13 0.04 25)" : "oklch(0.11 0.03 160)",
                      border: result.is_flagged ? "1px solid oklch(0.65 0.22 25 / 25%)" : "1px solid oklch(0.6 0.15 160 / 25%)",
                    }}>
                      <div className="flex items-center gap-3">
                        {result.is_flagged ? (
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-emerald-400" />
                        )}
                        <div>
                          <h4 className="font-semibold text-sm">Safety-Slope Decision</h4>
              <p className="text-xs text-muted-foreground/60 font-light">
                {result.is_flagged
                  ? "Drift rate exceeds lot threshold — component rejected"
                  : "Drift rate within lot threshold — component passes"}
              </p>
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
                        const unit = param.toLowerCase().includes('leak') ? 'µA/h' : 'ns/h';

                        return (
                          <motion.div key={param} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            className="rounded-lg p-4" style={{
                              background: "oklch(0.09 0.004 260)",
                              border: "1px solid oklch(1 0 0 / 5%)",
                            }}
                          >
                            <h4 className="text-xs font-medium uppercase tracking-widest text-center text-muted-foreground mb-3 capitalize">
                              {param.replace(/_/g, ' ')}
                            </h4>
                            <div className="h-[160px] flex justify-center items-center relative">
                              <Gauge 
                                value={Math.min(percentOfThreshold, 100)} 
                                enterTransition={{ stiffness: 100, damping: 25 }} 
                                enterStaggerScale={1.5}
                              />
                              <div className="absolute flex flex-col items-center top-[55%]">
                                <span className={`text-lg font-bold tabular-nums ${isDanger ? 'text-destructive' : 'text-emerald-400'}`}>
                                  <NumberFlow 
                                    value={animateValues ? data.implied_drift : 0} 
                                    format={{ minimumFractionDigits: 5, maximumFractionDigits: 5 }} 
                                    willChange
                                    isolate
                                  />
                                </span>
                                <span className="text-xs text-muted-foreground/50 uppercase font-medium">{unit} drift rate</span>
                                <span className="text-xs text-muted-foreground/40 mt-1">Drift Rate: {(data.implied_drift).toExponential(2)} {unit}</span>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-border/20 text-xs flex items-center justify-between">
                              <span className="text-muted-foreground/50 font-light">Lot threshold</span>
                              <span className="font-mono tabular-nums text-foreground/60">
                                {data.threshold.toFixed(5)} {unit}
                              </span>
                            </div>
                            <div className="mt-1.5">
                              <div className="h-1 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 4%)" }}>
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${Math.min(percentOfThreshold / 1.5, 100)}%`,
                                    background: isDanger
                                      ? "oklch(0.62 0.18 25)"
                                      : percentOfThreshold > 70
                                        ? "oklch(0.65 0.14 55)"
                                        : "oklch(0.65 0.12 160)",
                                  }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground/40 text-right mt-0.5 font-light">
                                {percentOfThreshold.toFixed(0)}% of threshold
                              </p>
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
