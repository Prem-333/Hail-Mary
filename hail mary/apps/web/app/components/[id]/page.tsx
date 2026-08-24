'use client';
import useSWR from "swr";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ComposedChart } from "recharts";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function ComponentDeepDive() {
  const { id } = useParams();
  const router = useRouter();
  const { data, isLoading } = useSWR(`http://127.0.0.1:8000/api/components/${id}`, fetcher);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (isLoading) return <div className="flex h-full items-center justify-center">Loading...</div>;
  if (!data) return <div>Component not found</div>;

  const { report, trajectories } = data;
  const anomaly = report.anomaly || {};
  const drift = report.drift || {};

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex items-center gap-4 mb-2">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Component: {data.component_id}</h1>
          <p className="text-sm text-muted-foreground">Lot: {data.lot_id} | Ground truth: {data.defect_type}</p>
        </div>
        <div className="ml-auto">
          <span className={`px-4 py-2 text-sm rounded font-bold text-white ${report.recommendation === 'REJECT' ? 'bg-destructive' : report.recommendation === 'ACCEPT' ? 'bg-green-600' : 'bg-amber-500'}`}>
            {report.recommendation}
          </span>
        </div>
      </div>

      <motion.div variants={itemVariants}>
        <Card>
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
                  <div key={param} className="h-[300px] border rounded-lg p-4 bg-muted/10">
                    <h4 className="font-semibold text-sm mb-4 capitalize text-center">{param.replace(/_/g, ' ')}</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e8ea" />
                        <XAxis dataKey="time" name="Hours" />
                        <YAxis domain={['dataMin - 2', 'dataMax + 2']} />
                        <Tooltip />
                        <Area type="monotone" dataKey="max" stroke="none" fill="#3498db" fillOpacity={0.1} />
                        <Area type="monotone" dataKey="min" stroke="none" fill="#fff" fillOpacity={1} />
                        <Line type="monotone" dataKey="val" stroke="#0f62fe" strokeWidth={3} dot={{ r: 6 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Anomaly Detection (Module A)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-4 rounded border-l-4 ${anomaly.is_anomalous ? 'border-destructive bg-destructive/10 text-destructive' : 'border-green-500 bg-green-50 text-green-700'}`}>
                <p className="font-bold">{anomaly.is_anomalous ? "ANOMALOUS" : "Normal"}</p>
                <p className="text-sm">Score: {anomaly.anomaly_score?.toFixed(2)}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 text-sm">Justification</h4>
                <p className="text-sm bg-muted p-3 rounded">{anomaly.justification || "N/A"}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Drift Prediction (Module B)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {drift.flagged_for_rejection ? (
                <div className="p-4 rounded border-l-4 border-amber-500 bg-amber-500/10 text-amber-700">
                  <p className="font-bold">Safety-slope flag triggered</p>
                  <p className="text-sm">Max implied drift rate exceeds lot threshold.</p>
                </div>
              ) : (
                <div className="p-4 rounded border-l-4 border-green-500 bg-green-50 text-green-700">
                  <p className="font-bold">Safety-slope check: PASSED</p>
                </div>
              )}
              
              <div className="text-sm border rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 font-semibold border-b">Parameter</th>
                      <th className="p-2 font-semibold border-b">Predicted 168h</th>
                      <th className="p-2 font-semibold border-b">Residual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(drift.per_parameter || {}).map(([param, pinfo]: [string, any]) => (
                      <tr key={param} className="border-b last:border-0">
                        <td className="p-2 capitalize">{param.replace(/_/g, ' ')}</td>
                        <td className="p-2 font-mono">{pinfo.predicted_168h_xgb?.toFixed(2)}</td>
                        <td className="p-2 font-mono">{pinfo.residual ? (pinfo.residual > 0 ? '+' : '') + pinfo.residual.toFixed(2) : "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Final AI Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg leading-relaxed">{report.recommendation_text}</p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
