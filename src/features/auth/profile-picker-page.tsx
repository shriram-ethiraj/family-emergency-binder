import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, LockKeyhole, Plus, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage, json } from "@/lib/api";
import type { SessionInfo } from "@/lib/domain";
import { AuthCard } from "./auth-card";

const schema = z.object({ fullName: z.string().trim().min(1, "Enter the name used in documents").max(120) });
type Values = z.infer<typeof schema>;
export function Component() {
  const { profiles, selectProfile, refreshProfiles, updateSession, lock, vault } = useSession(); const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { fullName: "" } });
  const choose = async (id: string) => { await selectProfile(id); navigate("/documents", { replace: true }); };
  const create = form.handleSubmit(async (values) => { try { const session = await api<SessionInfo>("/profiles", json("POST", { identity: values })); updateSession(session); await refreshProfiles(); navigate("/documents", { replace: true }); } catch (error) { form.setError("root", { message: errorMessage(error) }); } });
  return <AuthCard title="Choose a profile" description={`${vault.fileName} is unlocked. Profiles share this vault password.`}>{profiles.length > 0 && <div className="space-y-2">{profiles.map((profile) => <Button key={profile.id} variant="outline" className="h-12 w-full justify-start" onClick={() => void choose(profile.id)}><UserRound />{profile.name}</Button>)}</div>}
    <form className="space-y-3 border-t pt-5" onSubmit={create}><p className="text-sm font-medium">{profiles.length ? "Add another profile" : "Create the first profile"}</p><Field data-invalid={Boolean(form.formState.errors.fullName)}><FieldLabel htmlFor="profile-name">Full name</FieldLabel><Input id="profile-name" autoComplete="name" {...form.register("fullName")} /><FieldError errors={[form.formState.errors.fullName]} /></Field>{form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}<Button className="w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Saving…</> : <><Plus />Create profile</>}</Button></form>
    <Button variant="ghost" className="w-full" onClick={() => void lock()}><LockKeyhole />Lock vault</Button>
  </AuthCard>;
}
