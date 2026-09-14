import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, LoaderCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage, json } from "@/lib/api";
import type { ProfileSummary } from "@/lib/domain";
import { safeRedirect } from "@/lib/format";
import { queryClient, queryKeys } from "@/lib/query-client";
import { AuthCard } from "./auth-card";

const schema = z.object({ profileId: z.string().min(1, "Choose a profile"), password: z.string().min(4, "Enter your profile password") });
type Values = z.infer<typeof schema>;

export function Component() {
  const { activate } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profiles = useQuery({ queryKey: queryKeys.profiles, queryFn: async () => (await api<{ profiles: ProfileSummary[] }>("/profiles")).profiles });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { profileId: "", password: "" } });
  const reason = params.get("reason");

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await api<{ session: Parameters<typeof activate>[0] }>("/session/unlock", json("POST", values));
      activate(result.session);
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      navigate(safeRedirect(params.get("redirect")), { replace: true });
      toast.success("Profile unlocked");
    } catch (error) {
      form.setError("root", { message: errorMessage(error) });
    }
  });

  return <AuthCard title="Unlock your profile" description="Choose a local profile and enter its password to open your local vault." footer={<>New to this device? <Link className="font-medium text-primary hover:underline" to="/register">Create a profile</Link></>}>
    {reason && <Alert><LockKeyhole /><AlertTitle>{reason === "deleted" ? "Profile deleted" : "Vault locked"}</AlertTitle><AlertDescription>{reason === "expired" ? "Your profile locked after 30 minutes of inactivity." : reason === "deleted" ? "The profile and its stored records were permanently deleted." : "Your private data is secured."}</AlertDescription></Alert>}
    {profiles.isError && <Alert variant="destructive"><AlertTitle>Profiles unavailable</AlertTitle><AlertDescription>{errorMessage(profiles.error)}</AlertDescription></Alert>}
    {!profiles.isPending && profiles.data?.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center"><p className="text-sm text-muted-foreground">No profiles are stored on this device yet.</p><Button asChild className="mt-4"><Link to="/register">Create the first profile</Link></Button></div> : <form className="space-y-4" onSubmit={submit} noValidate>
      <Controller control={form.control} name="profileId" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="profile">Profile</FieldLabel><Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="profile" className="h-10 w-full"><SelectValue placeholder={profiles.isPending ? "Loading profiles…" : "Choose a profile"} /></SelectTrigger><SelectContent>{profiles.data?.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent></Select><FieldError errors={[fieldState.error]} /></Field>} />
      <Field data-invalid={Boolean(form.formState.errors.password)}><FieldLabel htmlFor="password">Profile password</FieldLabel><Input id="password" type="password" autoComplete="current-password" className="h-10" {...form.register("password")} /><FieldError errors={[form.formState.errors.password]} /></Field>
      {form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}
      <Button className="h-10 w-full" disabled={form.formState.isSubmitting || profiles.isPending}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Unlocking…</> : "Unlock profile"}</Button>
    </form>}
    <div className="text-center"><Link className="text-sm font-medium text-primary hover:underline" to="/recover">Use a recovery key</Link></div>
  </AuthCard>;
}
