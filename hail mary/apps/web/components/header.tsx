'use client';
import { Search, Bell, History, Shield } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export function Header() {
  return (
    <header className="border-b border-border/40 flex justify-between items-center w-full px-6 h-16 sticky top-0 z-10"
      style={{
        background: "oklch(0.085 0.003 260 / 85%)",
        backdropFilter: "blur(20px) saturate(1.3)",
        WebkitBackdropFilter: "blur(20px) saturate(1.3)",
      }}
    >
      <div className="flex items-center gap-4">
        <h2 className="text-base font-medium tracking-tight text-foreground/70">Burn-In Screening</h2>
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-semibold uppercase tracking-widest"
          style={{
            background: "oklch(0.12 0.004 260)",
            border: "1px solid oklch(1 0 0 / 5%)",
            color: "oklch(0.55 0.008 260)",
          }}
        >
          <Shield className="h-3 w-3" />
          ISRO
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 h-4 w-4" />
          <input 
            className="pl-9 pr-4 py-1.5 rounded-lg bg-muted/20 border border-border/30 text-sm w-48 transition-all focus:outline-none focus:ring-1 focus:ring-ring/20 focus:w-64 placeholder:text-muted-foreground/30" 
            placeholder="Search..." 
            type="text"
          />
        </div>
        
        <Button variant="ghost" size="icon" className="text-muted-foreground/50 hover:text-foreground/60 hover:bg-accent/20 h-8 w-8">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground/50 hover:text-foreground/60 hover:bg-accent/20 h-8 w-8">
          <History className="h-4 w-4" />
        </Button>
        
        <div className="w-7 h-7 rounded-full border border-border/40 overflow-hidden flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.18 0.004 260), oklch(0.12 0.003 260))" }}
        >
          <span className="text-[10px] font-medium text-muted-foreground/60">VC</span>
        </div>
      </div>
    </header>
  );
}