'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Activity, FlaskConical, FileBarChart, Radio, Sparkles } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { ShimmeringText } from "@/components/shimmering-text";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Lot Overview", icon: LayoutDashboard },
    { href: "/components", label: "Component Deep-Dive", icon: Activity },
    { href: "/monitor", label: "Sensor Monitor", icon: Radio, live: true },
    { href: "/simulator", label: "Rejection Simulator", icon: FlaskConical },
    { href: "/evaluation", label: "Evaluation Summary", icon: FileBarChart },
  ];

  return (
    <>
      {/* ─── Desktop Sidebar (md+) ─── */}
      <aside className="hidden md:flex md:flex-col fixed left-0 top-0 h-full w-[300px] border-r border-sidebar-border/50 py-7 z-20"
        style={{
          background: "linear-gradient(180deg, var(--sidebar) 0%, oklch(0.04 0.002 260) 100%)",
        }}
      >
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="px-6 mb-8"
        >
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              <ShimmeringText text="LATENT" />
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 tracking-[0.15em] uppercase font-light">
            Burn-In AI · ISRO Screening
          </p>
        </motion.div>

        <nav className="flex-1 overflow-y-auto">
          <ul className="flex flex-col space-y-1 px-3">
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
                    "flex items-center px-3 py-3 text-[15px] font-medium rounded-lg transition-all duration-300 interactive-scale",
                    isActive 
                      ? "text-foreground glass-card" 
                      : "text-muted-foreground hover:text-foreground/80 hover:bg-accent/30"
                  )}
                >
                  <Icon className="mr-3 h-[18px] w-[18px]" />
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
                        <span className="text-[11px] font-medium uppercase tracking-wider"
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
          <div className="px-6 pt-3 space-y-2">
              <div className="glass-card rounded-lg px-3 py-2.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                <p className="text-xs text-muted-foreground/70 dark:text-muted-foreground uppercase tracking-[0.15em] font-medium">
                  System Operational
                </p>
              </div>
              <div className="rounded-lg px-3 py-2 flex items-center justify-between"
                style={{ background: "oklch(0.10 0.008 270 / 60%)", border: "1px solid oklch(0.4 0.06 270 / 20%)" }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  LATENT
                </span>
                <span className="text-[10px] text-muted-foreground/30 dark:text-muted-foreground font-mono">v1.0.0</span>
              </div>
            </div>
        </motion.div>
      </aside>

      {/* ─── Mobile Bottom Nav (below md) ─── */}
      <nav
        className="flex md:hidden items-center justify-around fixed bottom-0 left-0 right-0 z-30"
        style={{
          height: 64,
          background: "oklch(0.06 0.002 260 / 90%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid oklch(1 0 0 / 8%)",
        }}
      >
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300",
                isActive
                  ? "text-foreground glass-card"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
