'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Activity, Beaker, FileBarChart, Settings, HelpCircle, Plus } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Lot Overview", icon: LayoutDashboard },
    { href: "/components", label: "Component Deep-Dive", icon: Activity },
    { href: "/simulator", label: "Rejection Simulator", icon: Beaker },
    { href: "/evaluation", label: "Evaluation Summary", icon: FileBarChart },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] border-r border-sidebar-border flex flex-col py-6 z-20"
      style={{
        background: "linear-gradient(180deg, var(--sidebar) 0%, oklch(0.05 0 0) 100%)",
      }}
    >
      <div className="px-6 mb-6">
        <h1 className="text-2xl font-bold tracking-tight"
          style={{
            background: "linear-gradient(135deg, #e0e0e0 0%, #808080 50%, #b0b0b0 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >LATENT</h1>
        <p className="text-xs text-muted-foreground mt-1 tracking-widest uppercase">Burn-In AI · System Controller</p>
      </div>
      
      <div className="px-6 mb-6">
        <Button className="w-full gap-2 font-semibold" style={{
          background: "linear-gradient(135deg, oklch(0.25 0 0) 0%, oklch(0.18 0 0) 100%)",
          border: "1px solid oklch(1 0 0 / 10%)",
        }}>
          <Plus size={18} /> Run New Batch
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <ul className="flex flex-col space-y-1">
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
                      ? "text-foreground border-l-2 border-chart-1 bg-accent/60" 
                      : "text-muted-foreground hover:bg-accent/30 hover:text-foreground border-l-2 border-transparent"
                  )}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto pt-4 border-t border-sidebar-border">
        <ul className="flex flex-col space-y-1">
          <li>
            <Link href="#" className="flex items-center px-6 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/30 transition-colors">
              <Settings className="mr-3 h-5 w-5" /> Settings
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center px-6 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/30 transition-colors">
              <HelpCircle className="mr-3 h-5 w-5" /> Support
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}
