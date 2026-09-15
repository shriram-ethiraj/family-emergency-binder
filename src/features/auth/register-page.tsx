import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { AuthCard } from "./auth-card";

const schema = z.object({ password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(PASSWORD_MAX_LENGTH), confirm: z.string() }).refine((value) => value.password === value.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;
export function Component() {
  const { createVault, directSave } = useSession(); const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const submit = form.handleSubmit(async ({ password }) => { try { await createVault(password); form.reset(); navigate("/recovery-key", { replace: true, state: { returnTo: "/profiles" } }); } catch (error) { if ((error as DOMException).name !== "AbortError") form.setError("root", { message: errorMessage(error) }); } });
  return <AuthCard title="Create an encrypted vault" description="Choose a strong password, then save the new .febvault wherever you want." footer={<>Already have a vault? <Link className="font-medium text-primary hover:underline" to="/login">Open it</Link></>}>
    {!directSave && <Alert><ShieldAlert /><AlertTitle>Compatibility mode</AlertTitle><AlertDescription>This browser downloads vault files instead of updating them in place. Chromium browsers are recommended. Keep the newest downloaded `.febvault` after every change.</AlertDescription></Alert>}
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2"><Field data-invalid={Boolean(form.formState.errors.password)}><FieldLabel htmlFor="new-password">Vault password</FieldLabel><Input id="new-password" type="password" autoComplete="new-password" className="h-10" {...form.register("password")} /><FieldError errors={[form.formState.errors.password]} /></Field><Field data-invalid={Boolean(form.formState.errors.confirm)}><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><Input id="confirm-password" type="password" autoComplete="new-password" className="h-10" {...form.register("confirm")} /><FieldError errors={[form.formState.errors.confirm]} /></Field></div>
      <FieldDescription>Use {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters. Losing both this password and the recovery key permanently loses access.</FieldDescription>
      {form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}
      <Button className="h-10 w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Encrypting…</> : directSave ? "Choose location and create vault" : "Create and download vault"}</Button>
    </form>
  </AuthCard>;
}
