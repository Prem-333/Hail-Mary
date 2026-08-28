'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Activity, Beaker, FileBarChart, Settings, HelpCircle, Plus, Radio, Sparkles } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Lot Overview", icon: LayoutDashboard },
    { href: "/components", label: "Component Deep-Dive", icon: Activity },
    { href: "/monitor", label: "Sensor Monitor", icon: Radio, live: true },
    { href: "/simulator", label: "Rejection Simulator", icon: Beaker },
    { href: "/evaluation", label: "Evaluation Summary", icon: FileBarChart },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] border-r border-sidebar-border/50 flex flex-col py-6 z-20"
      style={{
        background: "linear-gradient(180deg, var(--sidebar) 0%, oklch(0.04 0.002 260) 100%)",
      }}
    >
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="px-6 mb-6"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="opacity-30"
          >
            <Sparkles className="w-4 h-4 text-chart-1" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-shimmer">LATENT</h1>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 tracking-[0.15em] uppercase font-light">
          Burn-In AI · ISRO Screening
        </p>
      </motion.div>
      
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="px-6 mb-6"
      >
        <Button className="w-full gap-2 font-medium h-10 text-sm btn-primary-funded interactive-scale">
          <Plus size={16} /> Run New Batch
        </Button>
      </motion.div>

      <nav className="flex-1 overflow-y-auto">
        <ul className="flex flex-col space-y-0.5 px-3">
          {links.map((link, index) => {
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            const Icon = link.icon;
            
            return (
              <motion.li
                key={link.href}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * index }}
              >
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 interactive-scale",
                    isActive 
                      ? "text-foreground glass-card" 
                      : "text-muted-foreground hover:text-foreground/80 hover:bg-accent/30"
                  )}
                >
                  <Icon className="mr-3 h-4 w-4" />
                  <span className="font-normal">{link.label}</span>
                  {link.live && (
                    <motion.span 
                      className="ml-auto flex items-center gap-1.5"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full live-dot"
                        style={{ background: "oklch(0.65 0.10 160)" }}
                      />
                      <span className="text-[9px] font-medium uppercase tracking-wider"
                        style={{ color: "oklch(0.65 0.10 160)" }}
                      >
                        Live
                      </span>
                    </motion.span>
                  )}
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </nav>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-auto pt-4 border-t border-sidebar-border/30"
      >
        <ul className="flex flex-col space-y-0.5 px-3">
          <li>
            <Link href="#" className="flex items-center px-3 py-2 text-sm font-light text-muted-foreground hover:bg-accent/20 rounded-lg transition-all duration-200 interactive-scale">
              <Settings className="mr-3 h-4 w-4" /> Settings
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center px-3 py-2 text-sm font-light text-muted-foreground hover:bg-accent/20 rounded-lg transition-all duration-200 interactive-scale">
              <HelpCircle className="mr-3 h-4 w-4" /> Support
            </Link>
          </li>
        </ul>

        <div className="px-6 pt-4 mt-3">
          <div className="glass-card rounded-lg px-3 py-2.5">
            <p className="text-[8px] text-muted-foreground/60 uppercase tracking-[0.2em] font-medium">
              Built for ISRO · SIH 2026
            </p>
          </div>
        </div>
      </motion.div>
    </aside>
  );
}
