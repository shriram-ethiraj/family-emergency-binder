import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, UserRound } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage, json } from "@/lib/api";

const schema = z.object({ fullName: z.string().trim().min(1, "Enter a full name").max(120) });
type Values = z.infer<typeof schema>;

export function ProfileSettingsCard() {
  const { session, updateSession } = useSession();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { fullName: session?.profile.fullName ?? "" } });
  useEffect(() => form.reset({ fullName: session?.profile.fullName ?? "" }), [form, session?.profile.fullName]);
  const save = useMutation({ mutationFn: (values: Values) => api<{ revision: number; data: { fullName?: string } }>("/profile", json("PUT", { expectedRevision: session?.profileRevision, data: values })), onSuccess: (result) => { if (session) updateSession({ ...session, profile: result.data, profileRevision: result.revision }); toast.success("Profile details saved"); }, onError: (error) => form.setError("root", { message: errorMessage(error) }) });
  return <Card><CardHeader><span className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span><CardTitle>Profile details</CardTitle><CardDescription>Reusable identity details are revisioned.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}><Field data-invalid={Boolean(form.formState.errors.fullName)}><FieldLabel htmlFor="settings-full-name">Full name</FieldLabel><Input id="settings-full-name" className="h-10" autoComplete="name" {...form.register("fullName")} /><FieldError errors={[form.formState.errors.fullName]} /></Field>{form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}<Button disabled={save.isPending}>{save.isPending ? <><LoaderCircle className="animate-spin" />Saving…</> : "Save profile revision"}</Button></form></CardContent></Card>;
}
