import { AlertTriangle } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";

export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? error.statusText : error instanceof Error ? error.message : "The page could not be loaded.";
  return <main className="grid min-h-svh place-items-center p-6 text-center"><div className="max-w-md"><AlertTriangle className="mx-auto size-10 text-destructive" /><h1 className="mt-5 text-2xl font-semibold">Something went wrong</h1><p className="mt-3 text-muted-foreground">{message}</p><Button asChild className="mt-7"><Link to="/">Return to safety</Link></Button></div></main>;
}
