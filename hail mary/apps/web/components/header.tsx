'use client';
import { motion } from "framer-motion";
import { Shield } from "lucide-react";

export function Header() {
  return (
    <motion.header 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="border-b border-border/30 flex justify-between items-center w-full px-6 h-16 sticky top-0 z-10"
      style={{
        background: "oklch(0.08 0.002 260 / 70%)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
      }}
    >
      <div className="flex items-center gap-4">
        <motion.h2 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-xl font-bold tracking-tight text-foreground/90"
          style={{ textShadow: "0 0 20px oklch(0.7 0.05 250 / 30%)" }}
        >
          Burn-In Screening
        </motion.h2>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest glass-card"
          style={{ color: "oklch(0.7 0.01 260)", background: "oklch(0.12 0.008 260)", border: "1px solid oklch(0.4 0.01 260 / 30%)" }}
        >
          <Shield className="h-4 w-4" />
          ISRO
        </motion.div>
      </div>
      
      {/* Right side: operator badge only — no cosmetic dead buttons */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-3"
      >
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card"
          style={{ border: "1px solid oklch(0.4 0.01 260 / 20%)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
          <span className="text-xs text-muted-foreground/60 font-medium uppercase tracking-widest">
            System Operational
          </span>
        </div>
      </motion.div>
    </motion.header>
  );
}