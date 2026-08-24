'use client';
import { Search, Bell, History } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

export function Header() {
  return (
    <header className="bg-background border-b flex justify-between items-center w-full px-6 h-16 sticky top-0 z-10">
      <div className="flex items-center">
        <h2 className="text-xl font-semibold tracking-tight">Burn-In AI Screening</h2>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <input 
            className="pl-9 pr-4 py-1.5 border rounded-md bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm w-64 transition-all" 
            placeholder="Search..." 
            type="text"
          />
        </div>
        
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <History className="h-5 w-5" />
        </Button>
        
        <div className="w-8 h-8 rounded-full bg-muted border overflow-hidden flex items-center justify-center">
          <img 
            alt="Administrator" 
            className="w-full h-full object-cover" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBFwcWh7oZUc91gOg_smKtbjqMlJA40oFP4X77AXt7RfxYTiBY_kyEzuJpSFNjASvQxYZWfKV5e4__XgvvXzYThmaMof96BOEeYGBmEU3nsyplmGPRX_8AhLq5evf7eoaBgXPlHVOrA1DMyAQDzLbTvMy65Em0f6yZ19siQbbDghrzQvOKuiVcZqYEMuJoNwF4hkrXhSwQqzOXcT_A_yPrDpzuZdGDX2R6rG8-MHCVgdavLM-Rv87aC"
          />
        </div>
      </div>
    </header>
  );
}
