'use client';
import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import { LiveLineChart } from "@workspace/ui/components/charts/live-line-chart";
import { LiveLine } from "@workspace/ui/components/charts/live-line";
import { ChartTooltip } from "@workspace/ui/components/charts/tooltip";
import { LiveXAxis } from "@workspace/ui/components/charts/live-x-axis";
import { LiveYAxis } from "@workspace/ui/components/charts/live-y-axis";
import { Radio, Pause, Play, RotateCcw, AlertTriangle, CheckCircle, Zap } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

interface SensorPoint {
  time: number;
  value: number;
}

interface StreamMeta {
  lot_id: string;
  component_id: string;
  defect_type: string;
  available_lots: string[];
  available_components: string[];
}

export default function SensorMonitor() {
  const { data: lotsData } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/api/lots/`, fetcher, swrOpts);

  const [selectedLot, setSelectedLot] = useState<string>("");
  const [selectedComponent, setSelectedComponent] = useState<string>("");
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [meta, setMeta] = useState<StreamMeta | null>(null);

  // Sensor data stores
  const [leakageData, setLeakageData] = useState<SensorPoint[]>([]);
  const [delayData, setDelayData] = useState<SensorPoint[]>([]);
  const [currentLeakage, setCurrentLeakage] = useState(0);
  const [currentDelay, setCurrentDelay] = useState(0);
  const [currentHour, setCurrentHour] = useState(0);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Lot component list
  const { data: lotComponents } = useSWR(
    selectedLot ? `${process.env.NEXT_PUBLIC_API_URL}/api/streaming/components/${selectedLot}` : null,
    fetcher,
    swrOpts,
  );

  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !selectedLot) {
      setSelectedLot(lotsData.lots[0]);
    }
  }, [lotsData, selectedLot]);

  // Connect WebSocket
  const connectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/ws/sensor-stream`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send init config
      ws.send(JSON.stringify({
        lot_id: selectedLot || undefined,
        component_id: selectedComponent || undefined,
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "init") {
        setMeta(msg);
        setLeakageData([]);
        setDelayData([]);
        return;
      }

      if (msg.type === "data" && !pausedRef.current) {
        const now = msg.time;

        if (msg.leakage !== undefined) {
          setCurrentLeakage(msg.leakage);
          setLeakageData(prev => [...prev.slice(-500), { time: now, value: msg.leakage }]);
        }
        if (msg.delay !== undefined) {
          setCurrentDelay(msg.delay);
          setDelayData(prev => [...prev.slice(-500), { time: now, value: msg.delay }]);
        }
        if (msg.burn_in_hour !== undefined) {
          setCurrentHour(msg.burn_in_hour);
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWs();
      }, 3000);
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, [selectedLot, selectedComponent]);

  // Reconnect when lot/component changes
  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWs]);

  const handleRestart = () => {
    setLeakageData([]);
    setDelayData([]);
    setCurrentLeakage(0);
    setCurrentDelay(0);
    setCurrentHour(0);
    connectWs();
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  const leakageMomentum = {
    up: "oklch(0.65 0.22 25)",       // Red — leakage going up is bad
    down: "oklch(0.68 0.12 160)",    // Green — leakage dropping is good
    flat: "oklch(0.55 0.01 260)",    // Grey
  };

  const delayMomentum = {
    up: "oklch(0.65 0.22 25)",       // Red — delay going up is bad
    down: "oklch(0.68 0.12 160)",    // Green
    flat: "oklch(0.55 0.01 260)",    // Grey
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Sensor Monitor</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
              style={{
                background: connected ? "oklch(0.68 0.12 160 / 15%)" : "oklch(0.65 0.22 25 / 15%)",
                border: connected ? "1px solid oklch(0.68 0.12 160 / 30%)" : "1px solid oklch(0.65 0.22 25 / 30%)",
                color: connected ? "oklch(0.68 0.12 160)" : "oklch(0.65 0.22 25)",
              }}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'live-dot' : ''}`}
                style={{ background: connected ? "oklch(0.68 0.12 160)" : "oklch(0.65 0.22 25)" }}
              />
              {connected ? "Live" : "Offline"}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time parametric monitoring · Leakage current & propagation delay
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Lot selector */}
          <div className="w-40">
            <Select value={selectedLot} onValueChange={(v) => { setSelectedLot(v); setSelectedComponent(""); }}>
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

          {/* Component selector */}
          <div className="w-48">
            <Select value={selectedComponent} onValueChange={setSelectedComponent}>
              <SelectTrigger className="bg-card border-border/50 h-9 text-sm">
                <SelectValue placeholder="Auto (random)" />
              </SelectTrigger>
              <SelectContent>
                {lotComponents?.components?.map((c: any) => (
                  <SelectItem key={c.component_id} value={c.component_id}>
                    {c.component_id}
                    <span className="ml-1 text-muted-foreground text-xs">({c.defect_type})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Controls */}
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button variant="outline" size="icon" className="h-9 w-9 border-border/50"
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button variant="outline" size="icon" className="h-9 w-9 border-border/50" onClick={handleRestart}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Stream info strip */}
      {meta && (
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <Radio className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">Component</span>
            <span className="ml-auto text-sm font-mono font-bold tabular-nums">{meta.component_id}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <span className="text-xs text-muted-foreground uppercase tracking-widest">Lot</span>
            <span className="ml-auto text-sm font-mono font-bold">{meta.lot_id}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{
            background: meta.defect_type !== "normal"
              ? "linear-gradient(135deg, oklch(0.13 0.04 25) 0%, oklch(0.09 0.004 260) 100%)"
              : "linear-gradient(135deg, oklch(0.11 0.03 160) 0%, oklch(0.09 0.004 260) 100%)",
            border: meta.defect_type !== "normal"
              ? "1px solid oklch(0.65 0.22 25 / 15%)"
              : "1px solid oklch(0.6 0.12 160 / 15%)",
          }}>
            <span className="text-xs text-muted-foreground uppercase tracking-widest">Type</span>
            <span className={`ml-auto text-sm font-bold capitalize ${meta.defect_type !== "normal" ? "text-destructive" : "text-emerald-400"}`}>
              {meta.defect_type}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{
            background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">Burn-In Hour</span>
            <span className="ml-auto text-sm font-mono font-bold tabular-nums">{currentHour.toFixed(1)}h</span>
          </div>
        </motion.div>
      )}

      {/* Live Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Leakage Current Chart */}
        <motion.div variants={itemVariants}>
          <div className="rounded-lg overflow-hidden" style={{
            background: "linear-gradient(180deg, var(--card) 0%, oklch(0.085 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="p-5 border-b border-border/10 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Leakage Current</h3>
                <p className="text-xs text-muted-foreground mt-0.5">µA · Datasheet limit: 50.0 µA</p>
              </div>
              <div className="flex items-center gap-2">
                {currentLeakage > 50 ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                )}
                <span className={`text-lg font-bold font-mono tabular-nums ${currentLeakage > 50 ? 'text-destructive' : ''}`}>
                  {currentLeakage.toFixed(2)} µA
                </span>
              </div>
            </div>
            <div className="p-4 h-[280px]">
              {leakageData.length > 1 ? (
                <LiveLineChart
                  data={leakageData}
                  value={currentLeakage}
                  window={40}
                  paused={paused}
                  numXTicks={5}
                  nowOffsetUnits={1}
                  exaggerate
                >
                  <LiveLine
                    dataKey="value"
                    momentumColors={leakageMomentum}
                    formatValue={(v) => `${v.toFixed(2)} µA`}
                    strokeWidth={2}
                    dotSize={4}
                    pulse
                    badge
                    fill
                  />
                  <ChartTooltip showDatePill={false} />
                  <LiveXAxis />
                  <LiveYAxis position="left" formatValue={(v) => `${v.toFixed(1)}`} />
                </LiveLineChart>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin mb-3" />
                  <p className="text-xs text-muted-foreground">Waiting for sensor data…</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Propagation Delay Chart */}
        <motion.div variants={itemVariants}>
          <div className="rounded-lg overflow-hidden" style={{
            background: "linear-gradient(180deg, var(--card) 0%, oklch(0.085 0.004 260) 100%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}>
            <div className="p-5 border-b border-border/10 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Propagation Delay</h3>
                <p className="text-xs text-muted-foreground mt-0.5">ns · Datasheet limit: 18.0 ns</p>
              </div>
              <div className="flex items-center gap-2">
                {currentDelay > 18 ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                )}
                <span className={`text-lg font-bold font-mono tabular-nums ${currentDelay > 18 ? 'text-destructive' : ''}`}>
                  {currentDelay.toFixed(4)} ns
                </span>
              </div>
            </div>
            <div className="p-4 h-[280px]">
              {delayData.length > 1 ? (
                <LiveLineChart
                  data={delayData}
                  value={currentDelay}
                  window={40}
                  paused={paused}
                  numXTicks={5}
                  nowOffsetUnits={1}
                  exaggerate
                >
                  <LiveLine
                    dataKey="value"
                    momentumColors={delayMomentum}
                    formatValue={(v) => `${v.toFixed(4)} ns`}
                    strokeWidth={2}
                    dotSize={4}
                    pulse
                    badge
                    fill
                  />
                  <ChartTooltip showDatePill={false} />
                  <LiveXAxis />
                  <LiveYAxis position="left" formatValue={(v) => `${v.toFixed(2)}`} />
                </LiveLineChart>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin mb-3" />
                  <p className="text-xs text-muted-foreground">Waiting for sensor data…</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Datasheet limits reference */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg p-5" style={{
          background: "linear-gradient(135deg, var(--card) 0%, oklch(0.09 0.004 260) 100%)",
          border: "1px solid oklch(1 0 0 / 6%)",
        }}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Datasheet Limits Reference</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between text-sm px-3 py-2.5 rounded-lg" style={{ background: "oklch(0.09 0.004 260)", border: "1px solid oklch(1 0 0 / 4%)" }}>
              <span className="text-muted-foreground">Leakage Current Max</span>
              <span className="font-mono font-bold tabular-nums">50.0 µA</span>
            </div>
            <div className="flex items-center justify-between text-sm px-3 py-2.5 rounded-lg" style={{ background: "oklch(0.09 0.004 260)", border: "1px solid oklch(1 0 0 / 4%)" }}>
              <span className="text-muted-foreground">Propagation Delay Max</span>
              <span className="font-mono font-bold tabular-nums">18.0 ns</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
