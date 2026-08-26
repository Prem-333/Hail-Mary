'use client';
import { useState, useEffect } from "react";
import useSWR from "swr";
import axios from "axios";
import { motion } from "framer-motion";
import {
  ScatterChart,
  Scatter,
  Grid,
  XAxis,
  ReferenceLine,
  ChartTooltip,
} from "@workspace/ui/components/charts/scatter-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

export default function LotOverview() {
  const { data: lotsData, error: lotsError } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/api/lots/`, fetcher, swrOpts);
  const [selectedLot, setSelectedLot] = useState<string>("");

  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !selectedLot) {
      setSelectedLot(lotsData.lots[0]);
    }
  }, [lotsData, selectedLot]);

  const { data: lotDetails, isLoading, error: lotError } = useSWR(
    selectedLot ? `${process.env.NEXT_PUBLIC_API_URL}/api/lots/${selectedLot}` : null, 
    fetcher,
    swrOpts
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  if (lotsError || lotError) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-destructive gap-3 p-8 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-destructive/30 flex items-center justify-center">
          <span className="text-xl">!</span>
        </div>
        <h2 className="text-xl font-bold">Network Error</h2>
        <p className="text-muted-foreground max-w-md">Could not connect to the backend API. Make sure the Python FastAPI server is running on port 8000.</p>
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading lot data…</span>
      </div>
    </div>
  );
  if (!lotDetails) return null;

  const { metrics, components } = lotDetails;

  // Format data for our scatter chart (x = index, anomaly_score as y)
  const chartData = components.map((c: any, index: number) => ({
    x: index,
    score: c.anomaly_score,
    id: c.component_id,
    type: c.defect_type,
    is_anomalous: c.is_anomalous,
  }));

  const normalData = chartData.filter((d: any) => !d.is_anomalous);
  const anomalousData = chartData.filter((d: any) => d.is_anomalous);

  const statCards = [
    { label: "Total Components", value: metrics.total, color: "text-foreground" },
    { label: "Flagged Components", value: metrics.flagged, color: "text-destructive" },
    { label: "Latent Defects", value: metrics.latent, color: "text-amber-400" },
    { label: "Obvious Defects", value: metrics.obvious, color: "text-foreground" },
  ];

  return (
    <motion.div 
      variants={containerVariants} 
      initial="hidden" 
      animate="show" 
      className="flex flex-col gap-6"
    >
      <div className="flex justify-between items-center mb-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lot Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Anomaly score distribution and flagged components</p>
        </div>
        <div className="w-56">
          <Select value={selectedLot} onValueChange={setSelectedLot}>
            <SelectTrigger className="bg-card border-border/50">
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

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div key={card.label} variants={itemVariants}>
            <Card className="relative overflow-hidden" style={{
              background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
              border: "1px solid oklch(1 0 0 / 6%)",
            }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold tabular-nums ${card.color}`}>{card.value}</div>
              </CardContent>
              {/* Subtle gradient accent at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{
                background: i === 1 ? "linear-gradient(90deg, transparent, oklch(0.65 0.22 25), transparent)" :
                            i === 2 ? "linear-gradient(90deg, transparent, oklch(0.75 0.15 80), transparent)" :
                            "linear-gradient(90deg, transparent, oklch(1 0 0 / 6%), transparent)"
              }} />
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Scatter Chart */}
      <motion.div variants={itemVariants}>
        <Card style={{
          background: "linear-gradient(180deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <CardHeader>
            <CardTitle>Anomaly Score Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">
              Hover over points to inspect individual components. Ring size indicates anomaly severity.
            </p>
          </CardHeader>
          <CardContent>
            <ScatterChart data={chartData} xDataKey="x" aspectRatio="2.2 / 1" animationDuration={900}>
              <Grid horizontal />
              <XAxis formatTick={(v) => `#${v}`} />
              <ReferenceLine y={3.5} label="Threshold (3.5)" />

              {/* All points: uniform grey offset ring style matching bklit */}
              <Scatter
                dataKey="score"
                label="anomaly score"
                fill="rgba(160, 165, 180, 0.7)"
                stroke="rgba(160, 165, 180, 0.45)"
                radius={4}
                strokeWidth={2}
                ringGap={2}
                fadeOnHover
                inactiveOpacity={0.12}
                inactiveBlur={3}
                showActiveHighlight
              />

              <ChartTooltip
                renderContent={(row) => (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>{String(row.id)}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>score</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Number(row.score).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>type</span>
                      <span style={{ fontWeight: 700 }}>{String(row.type)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>status</span>
                      <span style={{ fontWeight: 700, color: row.is_anomalous ? '#ef4444' : '#10b981' }}>
                        {row.is_anomalous ? "anomalous" : "normal"}
                      </span>
                    </div>
                  </div>
                )}
              />
            </ScatterChart>
          </CardContent>
        </Card>
      </motion.div>

      {/* Flagged Components Table */}
      <motion.div variants={itemVariants}>
        <Card style={{
          background: "linear-gradient(180deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <CardHeader>
            <CardTitle>Flagged Components (Top 10)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-y border-border/30">
                    <th className="px-6 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest w-[20%]">Component ID</th>
                    <th className="px-6 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest w-[20%]">Lot</th>
                    <th className="px-6 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest w-[20%]">Anomaly Score</th>
                    <th className="px-6 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest w-[40%]">Status</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {components.filter((c: any) => c.is_anomalous).slice(0, 10).map((c: any) => (
                    <tr key={c.component_id} className="hover:bg-accent/20 transition-colors border-b border-border/20 last:border-0 border-l-2 border-l-transparent hover:border-l-destructive/50 cursor-pointer">
                      <td className="px-6 py-3.5">{c.component_id}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">{c.lot_id}</td>
                      <td className="px-6 py-3.5 font-bold text-destructive">{c.anomaly_score.toFixed(2)}</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/20">
                          Flagged
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
