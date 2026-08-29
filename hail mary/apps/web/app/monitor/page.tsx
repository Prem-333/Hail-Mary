'use client';
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import { LiveLineChart } from "@workspace/ui/components/charts/live-line-chart";
import { LiveLine } from "@workspace/ui/components/charts/live-line";
import { ChartTooltip } from "@workspace/ui/components/charts/tooltip";
import { LiveXAxis } from "@workspace/ui/components/charts/live-x-axis";
import { LiveYAxis } from "@workspace/ui/components/charts/live-y-axis";
import { useChartStable } from "@workspace/ui/components/charts/chart-context";
import { Radio, Pause, Play, RotateCcw, AlertTriangle, CheckCircle, Zap, Wifi, WifiOff } from "lucide-react";
import { scaleLinear } from "@visx/scale";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000";

const fetcher = (url: string) => axios.get(url).then(res => res.data);
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 5000 };

const LEAKAGE_LIMIT = 50.0; // µA
const DELAY_LIMIT = 18.0;   // ns

// Threshold reference line for live charts
function LiveThresholdLine({ threshold, label, color = "oklch(0.62 0.18 25)" }: { threshold: number; label?: string; color?: string }) {
  const { yScale, innerWidth, margin } = useChartStable();
  const y = yScale(threshold);
  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      <line
        x1={0}
        x2={innerWidth}
        y1={y}
        y2={y}
        stroke={color}
        strokeDasharray="6 4"
        strokeWidth={1.5}
        opacity={0.7}
      />
      {label && (
        <text
          x={innerWidth - 8}
          y={y - 8}
          textAnchor="end"
          fill={color}
          fontSize={10}
          fontWeight={600}
          opacity={0.7}
        >
          {label}
        </text>
      )}
    </g>
  );
}

interface SensorPoint {
  time: number;    // unix seconds
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
  const { data: lotsData } = useSWR(`${API_URL}/api/lots/`, fetcher, swrOpts);

  useEffect(() => { document.title = "Sensor Monitor — LATENT"; }, []);

  const [selectedLot, setSelectedLot] = useState<string>("");
  const [selectedComponent, setSelectedComponent] = useState<string>("");
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [meta, setMeta] = useState<StreamMeta | null>(null);

  const [leakageData, setLeakageData] = useState<SensorPoint[]>([]);
  const [delayData, setDelayData] = useState<SensorPoint[]>([]);
  const [currentLeakage, setCurrentLeakage] = useState(0);
  const [currentDelay, setCurrentDelay] = useState(0);
  const [currentHour, setCurrentHour] = useState(0);

  const pausedRef = useRef(paused);
  const metaRef = useRef<StreamMeta | null>(null);
  const leakDataRef = useRef<SensorPoint[]>([]);
  const delayDataRef = useRef<SensorPoint[]>([]);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { metaRef.current = meta; }, [meta]);

  const wsRef = useRef<WebSocket | null>(null);

  const { data: lotComponents } = useSWR(
    selectedLot ? `${API_URL}/api/streaming/components/${selectedLot}` : null,
    fetcher,
    swrOpts,
  );

  useEffect(() => {
    if (lotsData?.lots?.length > 0 && !selectedLot) {
      setSelectedLot(lotsData.lots[0]);
    }
  }, [lotsData, selectedLot]);

  const connectWs = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${WS_URL}/ws/sensor-stream`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        lot_id: selectedLot || undefined,
        component_id: selectedComponent || undefined,
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "init") {
        const prevMeta = metaRef.current;
        const isDifferentComponent = !prevMeta ||
          prevMeta.component_id !== msg.component_id ||
          prevMeta.lot_id !== msg.lot_id;

        setMeta(msg);
        if (isDifferentComponent) {
          setLeakageData([]);
          setDelayData([]);
          leakDataRef.current = [];
          delayDataRef.current = [];
        }
        return;
      }

      if (msg.type === "data" && !pausedRef.current) {
        const timeSec = msg.time;

        if (msg.leakage !== undefined) {
          const leakPoint: SensorPoint = { time: timeSec, value: msg.leakage };
          setCurrentLeakage(msg.leakage);
          leakDataRef.current = [...leakDataRef.current, leakPoint].slice(-600);
          setLeakageData(leakDataRef.current);
        }
        if (msg.delay !== undefined) {
          const delayPoint: SensorPoint = { time: timeSec, value: msg.delay };
          setCurrentDelay(msg.delay);
          delayDataRef.current = [...delayDataRef.current, delayPoint].slice(-600);
          setDelayData(delayDataRef.current);
        }
        if (msg.burn_in_hour !== undefined) {
          setCurrentHour(msg.burn_in_hour);
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };
  };

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [selectedLot, selectedComponent]);

  const handleRestart = () => {
    setLeakageData([]);
    setDelayData([]);
    leakDataRef.current = [];
    delayDataRef.current = [];
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

  const momentumColors = {
    up: "oklch(0.65 0.12 160)",
    down: "oklch(0.62 0.18 25)",
    flat: "oklch(0.55 0.01 260)",
  };

  const isDefective = meta && meta.defect_type !== "normal";

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-5">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Sensor Monitor</h1>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-medium uppercase tracking-widest glass-card ${
                connected ? 'text-emerald-500/80' : 'text-destructive/80'
              }`}
            >
              {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connected ? "Live" : "Offline"}
              {connected && (
                <span className="w-1.5 h-1.5 rounded-full live-dot ml-0.5" style={{ background: "oklch(0.65 0.12 160)" }} />
              )}
            </motion.div>
          </div>
          <p className="text-[13px] text-muted-foreground/40 mt-0.5 font-light">
            Streaming live burn-in telemetry · Real-time threshold monitoring
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedLot} onValueChange={(v) => { setSelectedLot(v ?? ""); setSelectedComponent(""); }}>
            <SelectTrigger className="w-40 h-9 glass-card text-sm font-medium rounded-xl">
              <SelectValue placeholder="Lot" />
            </SelectTrigger>
            <SelectContent className="glass-card rounded-xl">
              {lotsData?.lots?.map((lot: string) => (
                <SelectItem key={lot} value={lot} className="text-sm">{lot}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedComponent} onValueChange={(v) => setSelectedComponent(v ?? "")}>
            <SelectTrigger className="w-52 h-9 glass-card text-sm font-medium rounded-xl">
              <SelectValue placeholder="All Components (random)" />
            </SelectTrigger>
            <SelectContent className="glass-card rounded-xl">
              {lotComponents?.components?.map((c: any) => (
                <SelectItem key={c.component_id} value={c.component_id} className="text-sm font-mono">
                  {c.component_id}
                  <span className="ml-2 text-muted-foreground/40 text-xs font-sans normal-case">({c.defect_type})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl glass-card"
              onClick={() => setPaused(!paused)}
              title={paused ? "Resume stream" : "Pause stream"}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl glass-card"
              onClick={handleRestart}
              title="Restart stream and clear data"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Stream info strip */}
      {meta ? (
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-3">
          {[
            { icon: Radio, label: "Component", value: meta.component_id, mono: true },
            { icon: null, label: "Lot", value: meta.lot_id, mono: false },
            {
              icon: null,
              label: "Type",
              value: meta.defect_type,
              mono: false,
              color: isDefective ? "text-destructive font-semibold" : "text-emerald-400"
            },
            { icon: Zap, label: "Burn-In Hour", value: `${currentHour.toFixed(1)} h`, mono: true },
          ].map((item) => (
            <div key={item.label} className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
              {item.icon && <item.icon className="w-3.5 h-3.5 text-muted-foreground/30" />}
              <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest font-medium">{item.label}</span>
              <span className={`ml-auto text-sm font-medium tabular-nums ${item.mono ? 'font-mono' : ''} ${item.color || 'text-foreground/70'}`}>
                {item.value}
              </span>
            </div>
          ))}
        </motion.div>
      ) : (
        /* Skeleton while waiting for init message */
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass-card rounded-xl px-4 py-3 h-12 animate-pulse" style={{ background: "oklch(0.10 0.002 260)" }} />
          ))}
        </motion.div>
      )}

      {/* Live charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Leakage Current */}
        <motion.div variants={itemVariants}>
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-border/5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Leakage Current</h3>
                <p className="text-[10px] text-muted-foreground/35 mt-0.5 font-light">
                  µA · Limit: {LEAKAGE_LIMIT.toFixed(1)} µA (MIL-STD datasheet)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {currentLeakage > LEAKAGE_LIMIT ? (
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </motion.div>
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-400/60" />
                )}
                <span className={`text-lg font-mono font-semibold tabular-nums ${currentLeakage > LEAKAGE_LIMIT ? 'text-destructive' : 'text-foreground/70'}`}>
                  {currentLeakage.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground/30 font-light">µA</span>
              </div>
            </div>
            <div className="p-4" style={{ height: 320 }}>
              {leakageData.length > 1 ? (
                <LiveLineChart
                  data={leakageData}
                  value={currentLeakage}
                  window={60}
                  paused={paused}
                  numXTicks={6}
                  nowOffsetUnits={1}
                  exaggerate
                  dataKey="value"
                >
                  <LiveLine
                    dataKey="value"
                    momentumColors={momentumColors}
                    formatValue={(v) => `${v.toFixed(2)} µA`}
                    strokeWidth={2}
                    dotSize={4}
                    pulse
                    badge
                    fill
                  />
                  <ChartTooltip showDatePill={false} />
                  <LiveXAxis />
                  <LiveYAxis position="left" formatValue={(v) => `${v.toFixed(2)}`} />
                  <LiveThresholdLine threshold={LEAKAGE_LIMIT} label={`Limit ${LEAKAGE_LIMIT} µA`} />
                </LiveLineChart>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-8 border-2 border-muted-foreground/15 border-t-chart-1/50 rounded-full mb-3"
                  />
                  <p className="text-[11px] text-muted-foreground/35 font-light">Waiting for sensor data...</p>
                  <p className="text-[9px] text-muted-foreground/20 mt-1 font-light">Connects automatically on load</p>
                </div>
              )}
            </div>
            {/* Threshold context bar */}
            <div className="px-5 pb-4">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground/35 mb-1">
                <span>0 µA</span>
                <span className="text-destructive/50">⬆ Limit: {LEAKAGE_LIMIT} µA</span>
                <span>{LEAKAGE_LIMIT * 1.5} µA</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 4%)" }}>
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${Math.min((currentLeakage / (LEAKAGE_LIMIT * 1.5)) * 100, 100)}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    background: currentLeakage > LEAKAGE_LIMIT
                      ? "oklch(0.62 0.18 25)"
                      : currentLeakage > LEAKAGE_LIMIT * 0.8
                        ? "oklch(0.65 0.14 55)"
                        : "oklch(0.65 0.12 160)",
                  }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Propagation Delay */}
        <motion.div variants={itemVariants}>
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-border/5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Propagation Delay</h3>
                <p className="text-[10px] text-muted-foreground/35 mt-0.5 font-light">
                  ns · Limit: {DELAY_LIMIT.toFixed(1)} ns (MIL-STD datasheet)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {currentDelay > DELAY_LIMIT ? (
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </motion.div>
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-400/60" />
                )}
                <span className={`text-lg font-mono font-semibold tabular-nums ${currentDelay > DELAY_LIMIT ? 'text-destructive' : 'text-foreground/70'}`}>
                  {currentDelay.toFixed(4)}
                </span>
                <span className="text-[10px] text-muted-foreground/30 font-light">ns</span>
              </div>
            </div>
            <div className="p-4" style={{ height: 320 }}>
              {delayData.length > 1 ? (
                <LiveLineChart
                  data={delayData}
                  value={currentDelay}
                  window={60}
                  paused={paused}
                  numXTicks={6}
                  nowOffsetUnits={1}
                  exaggerate
                  dataKey="value"
                >
                  <LiveLine
                    dataKey="value"
                    momentumColors={momentumColors}
                    formatValue={(v) => `${v.toFixed(4)} ns`}
                    strokeWidth={2}
                    dotSize={4}
                    pulse
                    badge
                    fill
                  />
                  <ChartTooltip showDatePill={false} />
                  <LiveXAxis />
                  <LiveYAxis position="left" formatValue={(v) => `${v.toFixed(3)}`} />
                  <LiveThresholdLine threshold={DELAY_LIMIT} label={`Limit ${DELAY_LIMIT} ns`} />
                </LiveLineChart>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-8 border-2 border-muted-foreground/15 border-t-chart-1/50 rounded-full mb-3"
                  />
                  <p className="text-[11px] text-muted-foreground/35 font-light">Waiting for sensor data...</p>
                </div>
              )}
            </div>
            {/* Threshold context bar */}
            <div className="px-5 pb-4">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground/35 mb-1">
                <span>0 ns</span>
                <span className="text-destructive/50">⬆ Limit: {DELAY_LIMIT} ns</span>
                <span>{DELAY_LIMIT * 1.5} ns</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 4%)" }}>
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${Math.min((currentDelay / (DELAY_LIMIT * 1.5)) * 100, 100)}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    background: currentDelay > DELAY_LIMIT
                      ? "oklch(0.62 0.18 25)"
                      : currentDelay > DELAY_LIMIT * 0.8
                        ? "oklch(0.65 0.14 55)"
                        : "oklch(0.65 0.12 160)",
                  }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}