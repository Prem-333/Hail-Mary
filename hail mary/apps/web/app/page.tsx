'use client';
import { useState, useEffect } from "react";
import useSWR from "swr";
import axios from "axios";
import { motion } from "framer-motion";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function LotOverview() {
  const { data: lotsData } = useSWR("http://127.0.0.1:8000/api/lots", fetcher);
  const [selectedLot, setSelectedLot] = useState<string>("L-404");

  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !lotsData.lots.includes(selectedLot)) {
      setSelectedLot(lotsData.lots[0]);
    }
  }, [lotsData, selectedLot]);

  const { data: lotDetails, isLoading } = useSWR(
    selectedLot ? `http://127.0.0.1:8000/api/lots/${selectedLot}` : null, 
    fetcher
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (isLoading) return <div className="flex h-full items-center justify-center">Loading...</div>;
  if (!lotDetails) return null;

  const { metrics, components } = lotDetails;

  // Format data for Recharts (we use index as X axis, anomaly score as Y axis)
  const chartData = components.map((c: any, index: number) => ({
    x: index,
    y: c.anomaly_score,
    id: c.component_id,
    type: c.defect_type,
    is_anomalous: c.is_anomalous
  }));

  return (
    <motion.div 
      variants={containerVariants} 
      initial="hidden" 
      animate="show" 
      className="flex flex-col gap-6"
    >
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Lot Overview</h1>
        <div className="w-64">
          <Select value={selectedLot} onValueChange={setSelectedLot}>
            <SelectTrigger>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Total Components</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{metrics.total}</div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Flagged Components</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-destructive">{metrics.flagged}</div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Latent Defects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-amber-500">{metrics.latent}</div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Obvious Defects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{metrics.obvious}</div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={itemVariants}>
        <Card className="h-[450px] flex flex-col">
          <CardHeader>
            <CardTitle>Anomaly Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 w-full min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e8ea" />
                <XAxis type="number" dataKey="x" name="Index" tick={{fill: '#737687', fontSize: 12}} axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="y" name="Anomaly Score" tick={{fill: '#737687', fontSize: 12}} axisLine={false} tickLine={false} />
                <ZAxis type="number" range={[30, 200]} />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-background border rounded shadow-md p-3 text-sm">
                          <p className="font-bold">{data.id}</p>
                          <p>Score: {data.y.toFixed(2)}</p>
                          <p>Type: {data.type}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={3.5} stroke="#ba1a1a" strokeDasharray="3 3" label={{ position: 'top', value: 'Threshold (3.5)', fill: '#ba1a1a', fontSize: 12 }} />
                
                {/* Normal Points */}
                <Scatter name="Normal" data={chartData.filter(d => !d.is_anomalous)} fill="#94a3b8" fillOpacity={0.4} />
                {/* Flagged Points */}
                <Scatter name="Anomalous" data={chartData.filter(d => d.is_anomalous)} fill="#0f62fe" fillOpacity={0.8} shape="diamond" />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Flagged Components (Top 10)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 border-y">
                    <th className="px-6 py-3 font-semibold text-muted-foreground w-[20%]">Component ID</th>
                    <th className="px-6 py-3 font-semibold text-muted-foreground w-[20%]">Lot</th>
                    <th className="px-6 py-3 font-semibold text-muted-foreground w-[20%]">Anomaly Score</th>
                    <th className="px-6 py-3 font-semibold text-muted-foreground w-[40%]">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {components.filter((c: any) => c.is_anomalous).slice(0, 10).map((c: any) => (
                    <tr key={c.component_id} className="hover:bg-muted/30 transition-colors border-b last:border-0 border-l-2 border-l-transparent hover:border-l-primary cursor-pointer">
                      <td className="px-6 py-4">{c.component_id}</td>
                      <td className="px-6 py-4">{c.lot_id}</td>
                      <td className="px-6 py-4 font-bold text-destructive">{c.anomaly_score.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-destructive/10 text-destructive">
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
