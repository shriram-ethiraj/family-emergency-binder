import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AppThemeProvider } from "@/app/theme-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query-client";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250}>
          {children}
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </AppThemeProvider>
  );
}
