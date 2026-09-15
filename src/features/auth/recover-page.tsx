import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { AuthCard } from "./auth-card";

const schema = z.object({ recoveryKey: z.string().min(1, "Enter the recovery key"), newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(PASSWORD_MAX_LENGTH), confirm: z.string() }).refine((value) => value.newPassword === value.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;
export function Component() {
  const { vault, recoverVault } = useSession(); const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { recoveryKey: "", newPassword: "", confirm: "" } });
  if (!vault.selected) return <Navigate to="/login" replace />;
  const submit = form.handleSubmit(async ({ recoveryKey, newPassword }) => { try { await recoverVault(recoveryKey, newPassword); form.reset(); navigate("/profiles", { replace: true }); } catch (error) { form.setError("root", { message: errorMessage(error) }); } });
  return <AuthCard title="Recover your vault" description={`Use the offline recovery key for ${vault.fileName} and choose a new password.`} footer={<Link className="font-medium text-primary hover:underline" to="/login">Back to password unlock</Link>}><form className="space-y-4" onSubmit={submit} noValidate>
    <Field data-invalid={Boolean(form.formState.errors.recoveryKey)}><FieldLabel htmlFor="recovery-key">Recovery key</FieldLabel><Input id="recovery-key" autoComplete="off" className="h-10 font-mono text-xs" {...form.register("recoveryKey")} /><FieldDescription>The key is never stored by the application.</FieldDescription><FieldError errors={[form.formState.errors.recoveryKey]} /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field data-invalid={Boolean(form.formState.errors.newPassword)}><FieldLabel htmlFor="recovery-password">New vault password</FieldLabel><Input id="recovery-password" type="password" autoComplete="new-password" className="h-10" {...form.register("newPassword")} /><FieldError errors={[form.formState.errors.newPassword]} /></Field><Field data-invalid={Boolean(form.formState.errors.confirm)}><FieldLabel htmlFor="recovery-confirm">Confirm password</FieldLabel><Input id="recovery-confirm" type="password" autoComplete="new-password" className="h-10" {...form.register("confirm")} /><FieldError errors={[form.formState.errors.confirm]} /></Field></div>
    {form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}<Button className="h-10 w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Recovering…</> : "Recover and set password"}</Button>
  </form></AuthCard>;
}
