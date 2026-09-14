import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage, json } from "@/lib/api";
import type { ProfileSummary, SessionInfo } from "@/lib/domain";
import { queryKeys } from "@/lib/query-client";
import { AuthCard } from "./auth-card";

const schema = z.object({ profileId: z.string().min(1, "Choose a profile"), recoveryKey: z.string().min(1, "Enter the recovery key"), newPassword: z.string().min(4, "Use at least 4 characters"), confirm: z.string() }).refine((value) => value.newPassword === value.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;

export function Component() {
  const { activate } = useSession();
  const navigate = useNavigate();
  const profiles = useQuery({ queryKey: queryKeys.profiles, queryFn: async () => (await api<{ profiles: ProfileSummary[] }>("/profiles")).profiles });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { profileId: "", recoveryKey: "", newPassword: "", confirm: "" } });
  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await api<{ session: SessionInfo }>("/session/recover", json("POST", values));
      activate(result.session);
      navigate("/documents", { replace: true });
      toast.success("Password reset and profile unlocked");
    } catch (error) { form.setError("root", { message: errorMessage(error) }); }
  });
  return <AuthCard title="Recover your profile" description="Use the one-time recovery key you saved when the profile was created." footer={<Link className="font-medium text-primary hover:underline" to="/login">Back to password login</Link>}>
    <form className="space-y-4" onSubmit={submit} noValidate>
      <Controller control={form.control} name="profileId" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="recovery-profile">Profile</FieldLabel><Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="recovery-profile" className="h-10 w-full"><SelectValue placeholder="Choose a profile" /></SelectTrigger><SelectContent>{profiles.data?.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent></Select><FieldError errors={[fieldState.error]} /></Field>} />
      <Field data-invalid={Boolean(form.formState.errors.recoveryKey)}><FieldLabel htmlFor="recovery-key">Recovery key</FieldLabel><Input id="recovery-key" autoComplete="off" className="h-10 font-mono text-xs" {...form.register("recoveryKey")} /><FieldDescription>The key is not saved or logged by this screen.</FieldDescription><FieldError errors={[form.formState.errors.recoveryKey]} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field data-invalid={Boolean(form.formState.errors.newPassword)}><FieldLabel htmlFor="recovery-password">New password</FieldLabel><Input id="recovery-password" type="password" autoComplete="new-password" className="h-10" {...form.register("newPassword")} /><FieldError errors={[form.formState.errors.newPassword]} /></Field><Field data-invalid={Boolean(form.formState.errors.confirm)}><FieldLabel htmlFor="recovery-confirm">Confirm</FieldLabel><Input id="recovery-confirm" type="password" autoComplete="new-password" className="h-10" {...form.register("confirm")} /><FieldError errors={[form.formState.errors.confirm]} /></Field></div>
      {form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}
      <Button className="h-10 w-full" disabled={form.formState.isSubmitting || profiles.isPending}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Recovering…</> : "Recover and set password"}</Button>
    </form>
  </AuthCard>;
}
