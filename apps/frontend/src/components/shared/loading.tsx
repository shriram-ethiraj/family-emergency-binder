import { LoaderCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function FullScreenLoading() {
  return <div className="grid min-h-svh place-items-center bg-background"><div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary" />Opening your private vault…</div></div>;
}

export function PageLoading() {
  return <div className="space-y-5" aria-label="Loading"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div>;
}
