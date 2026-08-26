'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Activity, Beaker, FileBarChart, Settings, HelpCircle, Plus, Radio } from "lucide-react";
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
    <aside className="fixed left-0 top-0 h-full w-[260px] border-r border-sidebar-border flex flex-col py-6 z-20"
      style={{
        background: "linear-gradient(180deg, var(--sidebar) 0%, oklch(0.05 0.003 260) 100%)",
      }}
    >
      <div className="px-6 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-shimmer">LATENT</h1>
        <p className="text-[10px] text-muted-foreground mt-1 tracking-[0.2em] uppercase">
          Burn-In AI · ISRO Screening
        </p>
      </div>
      
      <div className="px-6 mb-6">
        <Button className="w-full gap-2 font-semibold h-11 text-sm btn-primary-funded">
          <Plus size={18} /> Run New Batch
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <ul className="flex flex-col space-y-0.5">
          {links.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            const Icon = link.icon;
            
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center px-6 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "text-foreground border-l-2 border-chart-1 bg-accent/50" 
                      : "text-muted-foreground hover:bg-accent/25 hover:text-foreground border-l-2 border-transparent"
                  )}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {link.label}
                  {link.live && (
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full live-dot"
                        style={{ background: "oklch(0.65 0.10 160)" }}
                      />
                      <span className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ color: "oklch(0.65 0.10 160)" }}
                      >
                        Live
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto pt-4 border-t border-sidebar-border">
        <ul className="flex flex-col space-y-1">
          <li>
            <Link href="#" className="flex items-center px-6 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/25 transition-colors">
              <Settings className="mr-3 h-5 w-5" /> Settings
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center px-6 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/25 transition-colors">
              <HelpCircle className="mr-3 h-5 w-5" /> Support
            </Link>
          </li>
        </ul>

        <div className="px-6 pt-4 mt-3 border-t border-sidebar-border">
          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-[0.25em]">
            Built for ISRO · SIH 2026
          </p>
        </div>
      </div>
    </aside>
  );
}
