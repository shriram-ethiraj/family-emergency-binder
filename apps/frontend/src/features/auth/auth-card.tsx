import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return <Card className="border-border/80 shadow-none"><CardHeader className="space-y-2 pb-5"><CardTitle><h1 className="text-2xl font-semibold tracking-tight">{title}</h1></CardTitle><CardDescription className="leading-6">{description}</CardDescription></CardHeader><CardContent><div className="space-y-5">{children}</div><div className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">{footer}</div></CardContent></Card>;
}
