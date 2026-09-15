import { FileLock2 } from "lucide-react";
import { APP_SHORT_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        <FileLock2 className="size-5" aria-hidden="true" />
      </span>
      {!compact && <div className="min-w-0">
        <p className={cn("truncate text-sm font-semibold tracking-tight", inverse && "text-white")}>{APP_SHORT_NAME}</p>
        <p className={cn("truncate text-xs text-muted-foreground", inverse && "text-slate-400")}>Private emergency binder</p>
      </div>}
    </div>
  );
}
