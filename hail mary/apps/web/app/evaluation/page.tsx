'use client';
import useSWR from "swr";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function EvaluationSummary() {
  const { data, isLoading } = useSWR("http://127.0.0.1:8000/api/evaluation", fetcher);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (isLoading) return <div className="flex h-full items-center justify-center">Loading...</div>;
  if (!data) return null;

  const am = data.anomaly_metrics;
  const dm = data.drift_metrics;
  const safety = data.safety_slope;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Evaluation Summary</h1>
      </div>

      <motion.div variants={itemVariants}>
        <h2 className="text-xl font-semibold mb-4">Anomaly Detection (Module A)</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">F2-Score</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{am.f2_score.toFixed(4)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Recall</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{(am.recall * 100).toFixed(1)}%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Precision</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{(am.precision * 100).toFixed(1)}%</div></CardContent>
          </Card>
          <Card className={am.false_negatives > 0 ? "border-destructive bg-destructive/5" : ""}>
            <CardHeader className="pb-2"><CardTitle className={`text-xs uppercase tracking-widest ${am.false_negatives > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>False Negatives</CardTitle></CardHeader>
            <CardContent><div className={`text-2xl font-bold ${am.false_negatives > 0 ? 'text-destructive' : ''}`}>{am.false_negatives}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">True Positives</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{am.true_positives} / {am.total_defects}</div></CardContent>
          </Card>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="mt-4">
        <h2 className="text-xl font-semibold mb-4">Drift Prediction Accuracy (Module B)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(dm).map(([param, m]: [string, any]) => (
            <Card key={param}>
              <CardHeader>
                <CardTitle className="capitalize">{param.replace(/_/g, ' ')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">XGBoost MAE</p>
                    <p className="text-xl font-bold">{m.xgb_mae?.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Linear MAE</p>
                    <p className="text-xl font-bold">{m.linear_mae?.toFixed(4)}</p>
                  </div>
                </div>
                
                <h4 className="font-semibold text-sm mb-2 border-b pb-2">Per-Class MAE</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground w-24">Normal</span>
                    <span className="font-mono">{m.xgb_mae_normal?.toFixed(4) || "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground w-24">Latent</span>
                    <span className="font-mono">{m.xgb_mae_latent?.toFixed(4) || "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground w-24">Obvious</span>
                    <span className="font-mono">{m.xgb_mae_obvious?.toFixed(4) || "N/A"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>
      
      <motion.div variants={itemVariants} className="mt-4">
        <h2 className="text-xl font-semibold mb-4">Safety-Slope Early Rejection</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-6 py-3 font-semibold text-muted-foreground">Class</th>
                  <th className="px-6 py-3 font-semibold text-muted-foreground">Total Components</th>
                  <th className="px-6 py-3 font-semibold text-muted-foreground">Flagged at 24h</th>
                  <th className="px-6 py-3 font-semibold text-muted-foreground">Flag Rate</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {safety.map((s: any) => (
                  <tr key={s.class} className="hover:bg-muted/30 border-b last:border-0 transition-colors">
                    <td className="px-6 py-4 font-sans font-medium">{s.class}</td>
                    <td className="px-6 py-4">{s.total}</td>
                    <td className="px-6 py-4 text-primary font-bold">{s.flagged}</td>
                    <td className="px-6 py-4">{(s.flag_rate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
