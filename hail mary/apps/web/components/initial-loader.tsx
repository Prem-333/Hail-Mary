'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function InitialLoader() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [rawProgress, setRawProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const [activeMessages, setActiveMessages] = useState<string[]>([]);

  useEffect(() => {
    if (loading) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [loading]);

  useEffect(() => {
    if (!started) return;

    const duration = 5000;
    const interval = 50;
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      
      // Calculate progress with a cubic ease-out effect to make it feel dynamic
      const currentRawProgress = currentStep / steps;
      const easedProgress = 1 - Math.pow(1 - currentRawProgress, 3);
      
      setProgress(easedProgress * 100);
      setRawProgress(currentRawProgress);

      if (currentStep >= steps) {
        clearInterval(timer);
        setTimeout(() => {
          setLoading(false);
        }, 150); // slight delay at 100% before fading out
      }
    }, interval);

    return () => clearInterval(timer);
  }, [started]);

  const handleStart = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen request failed", err);
    }
    
    const allMessages = [
      "Calibrating baseline telemetry...",
      "Loading Arrhenius drift physics...",
      "Booting SHAP explainability engine...",
      "Connecting to outlier detectors...",
      "Warming up Isolation Forest...",
      "Syncing component thresholds...",
      "Fetching recent lot metrics...",
      "Verifying datasheet parameters...",
      "Establishing secure data stream...",
      "Initializing anomaly detection models..."
    ];
    // Pick 3 random messages
    const shuffled = [...allMessages].sort(() => 0.5 - Math.random());
    setActiveMessages(shuffled.slice(0, 3));
    
    setStarted(true);
  };

  // Base message swapping on linear raw progress so each gets exactly 1/3 of the time
  const currentMsgIndex = Math.min(2, Math.floor(rawProgress * 3));
  const currentMessage = activeMessages[currentMsgIndex] || "Initializing System Models...";

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 flex flex-col items-center justify-center"
          style={{
            zIndex: 9999,
            background: "linear-gradient(180deg, oklch(0.04 0.002 260) 0%, oklch(0.02 0.001 260) 100%)",
          }}
        >
          <div className="flex flex-col items-center justify-center relative w-full max-w-md px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-center flex flex-col items-center"
            >
              <h1 className="text-6xl font-bold tracking-tight text-shimmer mb-2">LATENT</h1>
              <p className="text-sm text-muted-foreground tracking-[0.2em] uppercase font-light mb-12">
                Burn-In AI · ISRO Screening
              </p>
            </motion.div>

            {!started ? (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                onClick={handleStart}
                className="px-8 py-3 rounded-xl border border-emerald-500/30 text-emerald-500/90 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-400/50 uppercase tracking-widest text-xs font-medium transition-all duration-300 interactive-scale glass-card"
                style={{ boxShadow: "0 0 20px oklch(0.65 0.12 160 / 10%)" }}
              >
                Initialize System
              </motion.button>
            ) : (
              <>
                {/* Loading Bar Container */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="w-full h-[2px] bg-white/5 overflow-hidden rounded-full relative"
                >
                  {/* Progress fill */}
                  <motion.div
                    className="absolute top-0 left-0 bottom-0"
                    style={{ 
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, transparent, oklch(0.65 0.12 160))",
                      boxShadow: "0 0 20px oklch(0.65 0.12 160 / 50%)"
                    }}
                  />
                </motion.div>

                {/* Loading percentage text */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8 }}
                  className="w-full flex justify-between mt-4 text-xs tracking-wider text-emerald-100/70 font-light"
                >
                  <span className="flex items-center gap-3 h-5 overflow-hidden">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse shrink-0" style={{ boxShadow: "0 0 10px oklch(0.65 0.12 160 / 50%)" }} />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={currentMessage}
                        initial={{ opacity: 0, filter: "blur(4px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, filter: "blur(4px)" }}
                        transition={{ duration: 0.8, ease: "easeInOut" }}
                        className="text-emerald-50/90"
                      >
                        {currentMessage}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span className="font-mono text-[10px] text-emerald-200/50">{Math.round(progress)}%</span>
                </motion.div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
