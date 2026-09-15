import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage, json } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const schema = z.object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(PASSWORD_MAX_LENGTH), confirm: z.string() }).refine((value) => value.newPassword === value.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;

export function PasswordSettingsCard() {
  const { session, updateSession } = useSession();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });
  const change = useMutation({ mutationFn: ({ currentPassword, newPassword }: Values) => api<{ changed: true }>("/vault/change-password", json("POST", { currentPassword, newPassword })), onSuccess: () => { if (session) updateSession({ ...session }); form.reset(); toast.success("Vault password changed"); }, onError: (error) => form.setError("root", { message: errorMessage(error) }) });
  return <Card><CardHeader><span className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-5" /></span><CardTitle>Change vault password</CardTitle><CardDescription>This password protects every profile. Generated PDFs use separate passwords.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={form.handleSubmit((values) => change.mutate(values))}><Field data-invalid={Boolean(form.formState.errors.currentPassword)}><FieldLabel htmlFor="current-password">Current vault password</FieldLabel><Input id="current-password" type="password" autoComplete="current-password" className="h-10" {...form.register("currentPassword")} /><FieldError errors={[form.formState.errors.currentPassword]} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field data-invalid={Boolean(form.formState.errors.newPassword)}><FieldLabel htmlFor="settings-new-password">New vault password</FieldLabel><Input id="settings-new-password" type="password" autoComplete="new-password" className="h-10" {...form.register("newPassword")} /><FieldError errors={[form.formState.errors.newPassword]} /></Field><Field data-invalid={Boolean(form.formState.errors.confirm)}><FieldLabel htmlFor="settings-confirm-password">Confirm</FieldLabel><Input id="settings-confirm-password" type="password" autoComplete="new-password" className="h-10" {...form.register("confirm")} /><FieldError errors={[form.formState.errors.confirm]} /></Field></div>{form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}<Button disabled={change.isPending}>{change.isPending ? <><LoaderCircle className="animate-spin" />Changing…</> : "Change vault password"}</Button></form></CardContent></Card>;
}
