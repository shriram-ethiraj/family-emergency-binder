import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useSession } from "@/app/session-context";
import { Brand } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function Component() {
  const { session, recoveryKey, setRecoveryKey } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [finishing, setFinishing] = useState(false);
  if (!recoveryKey) return finishing ? null : <Navigate to={session ? "/settings" : "/login"} replace />;
  const finish = () => {
    setFinishing(true);
    navigate((location.state as { returnTo?: string } | null)?.returnTo ?? "/documents", { replace: true });
    setRecoveryKey(null);
  };
  const copy = async () => { await navigator.clipboard.writeText(recoveryKey); setCopied(true); };
  return <main className="relative grid min-h-svh place-items-center bg-background p-5"><div className="absolute left-5 top-5"><Brand /></div><div className="absolute right-5 top-5"><ThemeToggle /></div><Card className="w-full max-w-xl shadow-none"><CardHeader className="text-center"><span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="size-6" /></span><CardTitle><h1 className="text-2xl">Save this recovery key now</h1></CardTitle><CardDescription className="mx-auto max-w-md leading-6">This is the only way to reset the profile password. Store it offline and away from this computer.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="relative rounded-xl border border-dashed bg-muted/60 p-5 pt-14"><Button variant="outline" size="sm" className="absolute right-3 top-3" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy key"}</Button><code className="block break-all text-center text-sm font-semibold leading-7 text-foreground">{recoveryKey}</code></div><div className="flex items-start gap-3 rounded-xl border p-4"><Checkbox id="saved-key" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><Label htmlFor="saved-key" className="leading-5">I copied this recovery key and stored it safely.</Label></div><Button className="h-10 w-full" disabled={!confirmed} onClick={finish}>Continue to the vault</Button></CardContent></Card></main>;
}
