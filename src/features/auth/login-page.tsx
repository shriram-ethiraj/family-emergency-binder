import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpen, LoaderCircle, LockKeyhole, ShieldAlert, ShieldX } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { AuthCard } from "./auth-card";

const schema = z.object({ password: z.string().min(1, "Enter the vault password") });
type Values = z.infer<typeof schema>;

export function Component() {
  const { supported, directSave, vault, chooseVault, unlockVault, lock } = useSession();
  const navigate = useNavigate(); const [params] = useSearchParams();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const open = async () => { try { await chooseVault(); } catch (error) { if ((error as DOMException).name !== "AbortError") form.setError("root", { message: errorMessage(error) }); } };
  const submit = form.handleSubmit(async ({ password }) => { try { await unlockVault(password); form.reset(); navigate("/profiles", { replace: true }); } catch (error) { form.setError("root", { message: errorMessage(error) }); } });
  if (!supported) return <AuthCard title="Unsupported browser" description="This browser is missing the cryptography or worker features required to protect a vault."><Alert variant="destructive"><ShieldX /><AlertTitle>Update your browser</AlertTitle><AlertDescription>Use a current desktop release of Chrome, Edge, Firefox, or Safari. Chromium browsers provide the recommended in-place saving workflow.</AlertDescription></Alert></AuthCard>;
  return <AuthCard title={vault.selected ? "Unlock your vault" : "Open your family vault"} description={vault.selected ? `Enter the password for ${vault.fileName}.` : "Choose a .febvault from this computer or a removable drive."} footer={!vault.selected ? <>Need a new vault? <Link className="font-medium text-primary hover:underline" to="/register">Create one</Link></> : undefined}>
    {!directSave && <Alert><ShieldAlert /><AlertTitle>Compatibility mode</AlertTitle><AlertDescription>Chrome, Edge, or another Chromium browser is recommended for automatic in-place saving. In this browser, open vaults normally, then use <strong>Download updated vault</strong> after every change and keep the newest downloaded file.</AlertDescription></Alert>}
    {params.get("reason") && <Alert><LockKeyhole /><AlertTitle>Vault locked</AlertTitle><AlertDescription>{params.get("reason") === "expired" ? "The vault locked after 30 minutes of inactivity." : "Your decrypted data has been cleared from the app."}</AlertDescription></Alert>}
    {!vault.selected ? <Button className="h-11 w-full" onClick={() => void open()}><FolderOpen />Choose vault file</Button> : <form className="space-y-4" onSubmit={submit} noValidate>
      <Field data-invalid={Boolean(form.formState.errors.password)}><FieldLabel htmlFor="vault-password">Vault password</FieldLabel><Input id="vault-password" type="password" autoComplete="current-password" autoFocus className="h-10" {...form.register("password")} /><FieldDescription>The password is used only to unlock this selected file.</FieldDescription><FieldError errors={[form.formState.errors.password]} /></Field>
      {form.formState.errors.root && <p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}
      <Button className="h-10 w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Unlocking…</> : "Unlock vault"}</Button>
      <div className="flex justify-between text-sm"><button type="button" className="font-medium text-primary hover:underline" onClick={() => void lock()}>Choose a different file</button><Link className="font-medium text-primary hover:underline" to="/recover">Use recovery key</Link></div>
    </form>}
  </AuthCard>;
}
