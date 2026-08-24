'use client';
import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Gauge } from "@workspace/ui/components/charts/gauge";

export default function SimulatorPage() {
  const [formData, setFormData] = useState({
    lot_id: "L-404",
    leak_0h: 17.0,
    leak_24h: 17.2,
    delay_0h: 8.0,
    delay_24h: 8.04
  });
  
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post("http://127.0.0.1:8000/api/simulate", formData);
      setResult(res.data);
    } catch (err) {
      console.error(err);
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
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Live Early-Rejection Simulator</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={itemVariants} className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Input Measurements</CardTitle>
              <CardDescription>Enter hypothetical 0h and 24h readings to predict 168h drift in real-time.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Lot ID (Reference Cohort)</label>
                  <input 
                    name="lot_id"
                    value={formData.lot_id}
                    onChange={handleChange}
                    className="w-full mt-1 px-3 py-2 border rounded-md bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                
                <div className="pt-2 border-t">
                  <h4 className="font-semibold text-sm mb-3">Leakage Current (µA)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground">0h Value</label>
                      <input 
                        type="number" step="0.1" name="leak_0h"
                        value={formData.leak_0h} onChange={handleChange}
                        className="w-full mt-1 px-3 py-2 border rounded-md bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">24h Value</label>
                      <input 
                        type="number" step="0.1" name="leak_24h"
                        value={formData.leak_24h} onChange={handleChange}
                        className="w-full mt-1 px-3 py-2 border rounded-md bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <h4 className="font-semibold text-sm mb-3">Propagation Delay (ns)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground">0h Value</label>
                      <input 
                        type="number" step="0.1" name="delay_0h"
                        value={formData.delay_0h} onChange={handleChange}
                        className="w-full mt-1 px-3 py-2 border rounded-md bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">24h Value</label>
                      <input 
                        type="number" step="0.1" name="delay_24h"
                        value={formData.delay_24h} onChange={handleChange}
                        className="w-full mt-1 px-3 py-2 border rounded-md bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full mt-4" disabled={loading}>
                  {loading ? "Simulating..." : "Run Simulation"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Simulation Results</CardTitle>
            </CardHeader>
            <CardContent>
              {!result && !loading && (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <p>Run a simulation to see results here.</p>
                </div>
              )}
              {loading && (
                <div className="flex flex-col items-center justify-center h-[300px]">
                  <p className="animate-pulse font-medium">Processing physics model...</p>
                </div>
              )}
              {result && !loading && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                  <div className="flex justify-between items-center p-4 rounded-lg bg-muted/50 border">
                    <div>
                      <h3 className="font-semibold">Safety-Slope Status</h3>
                      <p className="text-sm text-muted-foreground">Is the drift rate exceeding the lot threshold?</p>
                    </div>
                    <div className={`px-4 py-2 rounded font-bold text-white ${result.is_flagged ? 'bg-destructive' : 'bg-green-600'}`}>
                      {result.is_flagged ? 'REJECT' : 'PASS'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Object.entries(result.results).map(([param, data]: [string, any]) => {
                      const percentOfThreshold = Math.min((data.implied_drift / data.threshold) * 100, 150);
                      const isDanger = data.implied_drift > data.threshold;
                      
                      return (
                        <div key={param} className="border rounded-lg p-4 bg-background shadow-sm">
                          <h4 className="font-medium text-center mb-4 capitalize">{param.replace(/_/g, ' ')}</h4>
                          
                          <div className="h-[200px] flex justify-center items-center relative">
                            {/* We use the bklit gauge chart here */}
                            <Gauge 
                              value={percentOfThreshold} 
                              max={150} 
                              showAnimation={true}
                            />
                            <div className="absolute flex flex-col items-center top-[60%]">
                              <span className={`text-xl font-bold ${isDanger ? 'text-destructive' : 'text-green-600'}`}>
                                {data.implied_drift.toFixed(4)}/h
                              </span>
                              <span className="text-xs text-muted-foreground">Drift Rate</span>
                            </div>
                          </div>
                          
                          <div className="mt-4 pt-4 border-t text-sm text-center">
                            Threshold: <span className="font-mono">{data.threshold.toFixed(4)}/h</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
