import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { KeySquare, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage, json } from "@/lib/api";

const schema = z.object({ password: z.string().min(1, "Enter your profile password") });
type Values = z.infer<typeof schema>;

export function RecoverySettingsCard() {
  const { setRecoveryKey } = useSession();
  const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const rotate = useMutation({ mutationFn: ({ password }: Values) => api<{ recoveryKey: string }>("/profile/rotate-recovery", json("POST", { password })), onSuccess: (result) => { setRecoveryKey(result.recoveryKey); form.reset(); navigate("/recovery-key", { state: { returnTo: "/settings" } }); }, onError: (error) => form.setError("root", { message: errorMessage(error) }) });
  return <Card><CardHeader><span className="mb-1 grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"><KeySquare className="size-5" /></span><CardTitle>Replace recovery key</CardTitle><CardDescription>The previous recovery key stops working immediately.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={form.handleSubmit((values) => rotate.mutate(values))}><Field data-invalid={Boolean(form.formState.errors.password)}><FieldLabel htmlFor="rotate-password">Profile password</FieldLabel><Input id="rotate-password" type="password" autoComplete="current-password" className="h-10" {...form.register("password")} /><FieldError errors={[form.formState.errors.password]} /></Field>{form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}<Button variant="destructive" disabled={rotate.isPending}>{rotate.isPending ? <><LoaderCircle className="animate-spin" />Replacing…</> : "Generate replacement key"}</Button></form></CardContent></Card>;
}
