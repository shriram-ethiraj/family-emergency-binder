import { Check, Circle, FolderOpen, LockKeyhole } from "lucide-react";
import { useTemplateCatalog } from "@/app/template-context";
import { useSession } from "@/app/session-context";

export function SetupChecklist() {
  const templates = useTemplateCatalog();
  const { vault } = useSession();
  const steps = [
    { label: "Templates", detail: templates.ready ? `${templates.folderName} · ${templates.templateCount} loaded` : "Choose the templates folder", done: templates.ready, icon: FolderOpen },
    { label: "Vault", detail: vault.unlocked ? `${vault.fileName} unlocked` : "Open or create your encrypted vault", done: vault.unlocked, icon: LockKeyhole },
  ];
  return <ol className="mb-5 grid gap-2" aria-label="Setup progress">{steps.map(({ label, detail, done, icon: Icon }, index) => <li key={label} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${done ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30" : "bg-muted/25"}`}>
    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>{done ? <Check className="size-4" /> : <Icon className="size-4" />}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{index + 1}. {label}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span>
    {!done && <Circle className="size-3 text-muted-foreground" />}
  </li>)}</ol>;
}
