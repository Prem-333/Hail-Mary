'use client';
import { Search, Bell, History, Shield } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

export function Header() {
  return (
    <header className="border-b border-border/50 flex justify-between items-center w-full px-6 h-16 sticky top-0 z-10"
      style={{
        background: "oklch(0.075 0.004 260 / 80%)",
        backdropFilter: "blur(16px) saturate(1.2)",
        WebkitBackdropFilter: "blur(16px) saturate(1.2)",
      }}
    >
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground/80">Burn-In AI Screening</h2>
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest"
          style={{
            background: "oklch(0.14 0.005 260)",
            border: "1px solid oklch(1 0 0 / 6%)",
            color: "oklch(0.6 0.008 260)",
          }}
        >
          <Shield className="h-3 w-3" />
          ISRO · Space-Grade QA
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <input 
            className="pl-9 pr-4 py-1.5 rounded-lg bg-muted/30 border border-border/50 text-sm w-56 transition-all focus:outline-none focus:ring-1 focus:ring-ring/30 focus:w-72 placeholder:text-muted-foreground/50" 
            placeholder="Search components..." 
            type="text"
            style={{
              backdropFilter: "blur(8px)",
            }}
          />
        </div>
        
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-accent/40">
          <Bell className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-accent/40">
          <History className="h-5 w-5" />
        </Button>
        
        <div className="w-8 h-8 rounded-full border border-border/50 overflow-hidden flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.22 0.005 260), oklch(0.14 0.004 260))" }}
        >
          <span className="text-xs font-bold text-muted-foreground">VC</span>
        </div>
      </div>
    </header>
  );
}
