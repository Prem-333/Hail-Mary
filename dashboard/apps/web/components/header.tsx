'use client';
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ChevronRight, Moon, Sun, Maximize2, Minimize2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useFullscreen } from "@/components/auto-fullscreen";

const PAGE_LABELS: Record<string, string> = {
  "/": "Lot Overview",
  "/components": "Component Deep-Dive",
  "/monitor": "Sensor Monitor",
  "/simulator": "Rejection Simulator",
  "/evaluation": "Evaluation Summary",
};

function getPageLabel(pathname: string): string {
  // Exact match first
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  // Prefix match for dynamic routes like /components/[id]
  for (const [key, label] of Object.entries(PAGE_LABELS)) {
    if (key !== "/" && pathname.startsWith(key)) return label;
  }
  return "LATENT";
}

export function Header() {
  const pathname = usePathname();
  const pageLabel = getPageLabel(pathname);
  const { theme, setTheme } = useTheme();
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <motion.header 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="border-b border-border/30 flex justify-between items-center w-full px-8 h-14 sticky top-0 z-10"
      style={{
        background: "oklch(0.08 0.002 260 / 70%)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Breadcrumb: LATENT > Page */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2"
        >
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: "oklch(0.55 0.03 260)" }}
          >
            LATENT
          </span>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: "oklch(0.40 0.02 260)" }} />
          <h2
            className="text-sm font-semibold tracking-tight text-foreground/90"
            style={{ textShadow: "0 0 20px oklch(0.7 0.05 250 / 30%)" }}
          >
            {pageLabel}
          </h2>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest glass-card"
          style={{ color: "oklch(0.7 0.01 260)", background: "oklch(0.12 0.008 260)", border: "1px solid oklch(0.4 0.01 260 / 30%)" }}
        >
          <Shield className="h-3.5 w-3.5" />
          ISRO
        </motion.div>
      </div>
      
      {/* Right side: action buttons + operator badge */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-3"
      >
        {/* Icon buttons */}
        <div className="flex items-center gap-2">
          {/* Fullscreen toggle */}
          <button
            onClick={toggle}
            className="w-8 h-8 rounded-lg glass-card flex items-center justify-center hover:scale-105 transition"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-foreground/70" />
            ) : (
              <Maximize2 className="w-4 h-4 text-foreground/70" />
            )}
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-8 h-8 rounded-lg glass-card flex items-center justify-center hover:scale-105 transition"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={theme}
                initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                transition={{ duration: 0.2 }}
              >
                {theme === "dark" ? (
                  <Moon className="w-4 h-4 text-foreground/70" />
                ) : (
                  <Sun className="w-4 h-4 text-foreground/70" />
                )}
              </motion.div>
            </AnimatePresence>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card"
          style={{ border: "1px solid oklch(0.4 0.01 260 / 20%)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
          <span className="text-xs text-muted-foreground/60 dark:text-muted-foreground font-medium uppercase tracking-widest">
            System Operational
          </span>
        </div>
      </motion.div>
    </motion.header>
  );
}