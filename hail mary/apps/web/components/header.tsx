'use client';
import { motion } from "framer-motion";
import { Search, Bell, History, Shield, Sparkles } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

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
          className="text-lg font-bold tracking-tight text-foreground/90"
          style={{ textShadow: "0 0 20px oklch(0.7 0.05 250 / 30%)" }}
        >
          Burn-In Screening
        </motion.h2>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest glass-card"
          style={{ color: "oklch(0.7 0.01 260)", background: "oklch(0.12 0.008 260)", border: "1px solid oklch(0.4 0.01 260 / 30%)" }}
        >
          <Shield className="h-3.5 w-3.5" />
          ISRO
        </motion.div>
      </div>
      
      <div className="flex items-center space-x-2">
        <motion.div 
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="relative hidden md:block"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 h-4 w-4" />
          <input 
            className="pl-9 pr-4 py-1.5 rounded-xl glass-card text-sm w-52 transition-all duration-300 focus:outline-none focus:ring-1 focus:ring-chart-1/30 focus:w-64 placeholder:text-muted-foreground/25" 
            placeholder="Search..." 
            type="text"
          />
        </motion.div>
        
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button variant="ghost" size="icon" className="text-muted-foreground/40 hover:text-foreground/60 hover:bg-accent/20 h-9 w-9 rounded-xl transition-all duration-200">
            <Bell className="h-4 w-4" />
          </Button>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button variant="ghost" size="icon" className="text-muted-foreground/40 hover:text-foreground/60 hover:bg-accent/20 h-9 w-9 rounded-xl transition-all duration-200">
            <History className="h-4 w-4" />
          </Button>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          whileHover={{ scale: 1.08 }}
          className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center glass-card cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.15 0.005 260) 0%, oklch(0.08 0.003 260) 100%)",
            border: "1px solid oklch(0.5 0.01 260 / 30%)",
            boxShadow: "0 0 20px oklch(0.6 0.02 260 / 15%)"
          }}
        >
          <span className="text-[11px] font-bold tracking-tight text-foreground/90" style={{ textShadow: "0 0 10px oklch(0.7 0.05 250 / 40%)" }}>VC</span>
        </motion.div>
      </div>
    </motion.header>
  );
}