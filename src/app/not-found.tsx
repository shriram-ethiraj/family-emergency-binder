import { FileQuestion } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useSession } from "@/app/session-context";

export function NotFoundPage() {
  const { session } = useSession();
  return <main className="grid min-h-svh place-items-center bg-background p-6 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><FileQuestion className="size-7" /></span><p className="mt-6 text-sm font-semibold text-primary">404</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">This page isn’t available</h1><p className="mt-3 text-muted-foreground">The address may be incorrect, or the page may have moved.</p><Button asChild className="mt-7"><Link to={session ? "/documents" : "/login"}>{session ? "Return to documents" : "Return to login"}</Link></Button></div></main>;
}
