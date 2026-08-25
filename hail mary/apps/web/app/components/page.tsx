'use client';
import { useState, useEffect } from "react";
import useSWR from "swr";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

export default function ComponentsIndex() {
  const { data: lotsData } = useSWR("http://127.0.0.1:8000/api/lots/", fetcher, swrOpts);
  const [selectedLot, setSelectedLot] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !selectedLot) {
      setSelectedLot(lotsData.lots[0]);
    }
  }, [lotsData, selectedLot]);

  const { data: lotDetails, isLoading } = useSWR(
    selectedLot ? `http://127.0.0.1:8000/api/lots/${selectedLot}` : null,
    fetcher,
    swrOpts
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  const components = lotDetails?.components || [];
  const flaggedCount = components.filter((c: any) => c.is_anomalous).length;
  const normalCount = components.length - flaggedCount;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Component Deep-Dive</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Select a component to view its trajectory, SHAP explanation, and AI assessment</p>
        </div>
        <div className="w-48">
          <Select value={selectedLot} onValueChange={setSelectedLot}>
            <SelectTrigger className="bg-card border-border/50 h-9 text-sm">
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

      {/* Summary strip */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{
          background: "linear-gradient(135deg, var(--card) 0%, oklch(0.1 0 0) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="ml-auto text-lg font-bold tabular-nums">{components.length}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{
          background: "linear-gradient(135deg, oklch(0.13 0.04 25) 0%, oklch(0.1 0 0) 100%)",
          border: "1px solid oklch(0.65 0.22 25 / 15%)",
        }}>
          <AlertTriangle className="h-4 w-4 text-destructive/70" />
          <span className="text-sm text-destructive/70">Flagged</span>
          <span className="ml-auto text-lg font-bold tabular-nums text-destructive">{flaggedCount}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{
          background: "linear-gradient(135deg, oklch(0.12 0.03 160) 0%, oklch(0.1 0 0) 100%)",
          border: "1px solid oklch(0.6 0.15 160 / 15%)",
        }}>
          <CheckCircle className="h-4 w-4 text-emerald-500/70" />
          <span className="text-sm text-emerald-500/70">Normal</span>
          <span className="ml-auto text-lg font-bold tabular-nums text-emerald-400">{normalCount}</span>
        </div>
      </motion.div>

      {/* Component grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {components.map((c: any, i: number) => (
            <motion.div
              key={c.component_id}
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push(`/components/${c.component_id}`)}
              className="cursor-pointer group"
            >
              <div className="rounded-lg p-4 h-full transition-colors" style={{
                background: "linear-gradient(135deg, var(--card) 0%, oklch(0.1 0 0) 100%)",
                border: c.is_anomalous
                  ? "1px solid oklch(0.65 0.22 25 / 20%)"
                  : "1px solid oklch(1 0 0 / 6%)",
              }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-sm font-medium truncate">{c.component_id}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-all duration-200 -translate-x-1 group-hover:translate-x-0" />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{
                      background: c.is_anomalous ? "oklch(0.65 0.22 25)" : "oklch(0.6 0.15 160)"
                    }} />
                    <span className="text-xs text-muted-foreground capitalize">{c.defect_type}</span>
                  </div>
                  <span className={`text-xs font-mono font-bold tabular-nums ${c.is_anomalous ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {c.anomaly_score.toFixed(1)}
                  </span>
                </div>

                {/* Score bar */}
                <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 5%)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(c.anomaly_score / 25 * 100, 100)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.02 }}
                    style={{
                      background: c.is_anomalous
                        ? "linear-gradient(90deg, oklch(0.65 0.22 25), oklch(0.55 0.25 25))"
                        : "linear-gradient(90deg, oklch(0.4 0 0), oklch(0.3 0 0))"
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
