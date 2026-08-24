'use client';
import { useState, useEffect } from "react";
import useSWR from "swr";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import { useRouter } from "next/navigation";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function ComponentsIndex() {
  const { data: lotsData } = useSWR("http://127.0.0.1:8000/api/lots", fetcher);
  const [selectedLot, setSelectedLot] = useState<string>("L-404");
  const [selectedComp, setSelectedComp] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !lotsData.lots.includes(selectedLot)) {
      setSelectedLot(lotsData.lots[0]);
    }
  }, [lotsData, selectedLot]);

  const { data: lotDetails } = useSWR(
    selectedLot ? `http://127.0.0.1:8000/api/lots/${selectedLot}` : null, 
    fetcher
  );

  const handleGo = () => {
    if (selectedComp) {
      router.push(`/components/${selectedComp}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Component Deep-Dive</h1>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Select Component</CardTitle>
          <CardDescription>Choose a lot and component to view its parametric trajectory and SHAP explanation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Lot</label>
            <Select value={selectedLot} onValueChange={setSelectedLot}>
              <SelectTrigger><SelectValue placeholder="Select Lot" /></SelectTrigger>
              <SelectContent>
                {lotsData?.lots?.map((lot: string) => (
                  <SelectItem key={lot} value={lot}>{lot}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Component</label>
            <Select value={selectedComp} onValueChange={setSelectedComp} disabled={!lotDetails}>
              <SelectTrigger><SelectValue placeholder="Select Component" /></SelectTrigger>
              <SelectContent>
                {lotDetails?.components?.map((c: any) => (
                  <SelectItem key={c.component_id} value={c.component_id}>
                    {c.component_id} {c.is_anomalous ? " (Flagged)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGo} disabled={!selectedComp} className="w-full">
            Analyze Component
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
