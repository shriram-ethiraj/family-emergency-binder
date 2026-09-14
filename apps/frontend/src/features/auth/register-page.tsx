import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage, json } from "@/lib/api";
import type { SessionInfo, StorageStatus } from "@/lib/domain";
import { queryClient, queryKeys } from "@/lib/query-client";
import { AuthCard } from "./auth-card";

const schema = z.object({
  fullName: z.string().trim().min(1, "Enter the name used in documents").max(120),
  password: z.string().min(4, "Use at least 4 characters"),
  confirm: z.string(),
}).refine((value) => value.password === value.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;

export function Component() {
  const { activate, setRecoveryKey } = useSession();
  const navigate = useNavigate();
  const storage = useQuery({ queryKey: queryKeys.storage, queryFn: () => api<StorageStatus>("/storage") });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { fullName: "", password: "", confirm: "" } });
  const submit = form.handleSubmit(async ({ fullName, password }) => {
    try {
      const result = await api<{ session: SessionInfo; recoveryKey: string }>("/profiles", json("POST", { password, identity: { fullName } }));
      setRecoveryKey(result.recoveryKey);
      activate(result.session);
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
      navigate("/recovery-key", { replace: true, state: { returnTo: "/documents" } });
    } catch (error) { form.setError("root", { message: errorMessage(error) }); }
  });
  return <AuthCard title="Create a profile" description="This profile and its documents will be stored only in the local vault on this computer." footer={<>Already have a profile? <Link className="font-medium text-primary hover:underline" to="/login">Unlock it</Link></>}>
    <form className="space-y-4" onSubmit={submit} noValidate>
      <Field data-invalid={Boolean(form.formState.errors.fullName)}><FieldLabel htmlFor="full-name">Full name</FieldLabel><Input id="full-name" autoComplete="name" className="h-10" {...form.register("fullName")} /><FieldDescription>Used in forms, generated documents, and the profile picker.</FieldDescription><FieldError errors={[form.formState.errors.fullName]} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field data-invalid={Boolean(form.formState.errors.password)}><FieldLabel htmlFor="new-password">Password</FieldLabel><Input id="new-password" type="password" autoComplete="new-password" className="h-10" {...form.register("password")} /><FieldError errors={[form.formState.errors.password]} /></Field><Field data-invalid={Boolean(form.formState.errors.confirm)}><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><Input id="confirm-password" type="password" autoComplete="new-password" className="h-10" {...form.register("confirm")} /><FieldError errors={[form.formState.errors.confirm]} /></Field></div>
      {form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}
      <Button className="h-10 w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Creating…</> : "Create profile"}</Button>
    </form>
    {storage.data && <p className="text-center text-xs text-muted-foreground">Saved in {storage.data.databaseFile}</p>}
  </AuthCard>;
}
