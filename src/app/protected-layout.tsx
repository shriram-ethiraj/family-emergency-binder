import { CircleAlert, CircleCheck, FileText, Files, LoaderCircle, LockKeyhole, Save, Settings, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useSession } from "@/app/session-context";
import { Brand } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { APP_VERSION } from "@/lib/branding";
import { initials } from "@/lib/format";
import { toast } from "sonner";

const navigation = [
  { to: "/documents", label: "Documents", icon: Files },
  { to: "/templates", label: "Print templates", icon: FileText },
  { to: "/settings", label: "Profile settings", icon: Settings },
];

function titleFor(pathname: string) {
  if (pathname === "/documents/new") return "Create document";
  if (/^\/documents\/[^/]+\/edit$/.test(pathname)) return "Edit document";
  if (pathname.startsWith("/templates")) return "Print templates";
  if (pathname.startsWith("/settings")) return "Profile settings";
  return "Documents";
}

function VaultSyncFlag({ directSave, vault }: { directSave: boolean; vault: ReturnType<typeof useSession>["vault"] }) {
  const state = vault.saveState;
  const label = state === "saving"
    ? (directSave ? "Syncing updates…" : "Preparing vault update…")
    : state === "error"
      ? (directSave ? "Vault sync failed" : "Vault download failed")
      : state === "dirty"
        ? "Updates need download"
        : directSave ? "Updates synced to vault" : "Downloaded vault is current";
  const detail = state === "dirty" ? "Download now to keep these changes" : vault.fileName ?? "No vault selected";
  const colors = state === "error" || state === "dirty"
    ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
    : state === "saving"
      ? "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
      : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
  const Icon = state === "saving" ? LoaderCircle : state === "error" || state === "dirty" ? CircleAlert : CircleCheck;
  return <div role="status" aria-live="polite" className={`mx-1 flex items-start gap-2 rounded-lg border px-2.5 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 ${colors}`} title={`${label}. ${detail}.`}>
    <Icon className={`mt-0.5 size-4 shrink-0 ${state === "saving" ? "animate-spin" : ""}`} />
    <span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block text-xs font-semibold leading-4">{label}</span><span className="block truncate text-[11px] leading-4 opacity-75">{detail}</span></span>
  </div>;
}

function AppSidebar() {
  const { session, lock, vault, saveCopy, directSave } = useSession();
  const location = useLocation();
  if (!session) return null;
  return <Sidebar collapsible="icon" className="border-r bg-sidebar text-sidebar-foreground">
    <SidebarHeader className="px-4 py-4"><Brand /></SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {navigation.map(({ to, label, icon: Icon }) => {
              const active = to === "/documents" ? location.pathname === to || location.pathname.startsWith("/documents/") : location.pathname.startsWith(to);
              return <SidebarMenuItem key={to}><SidebarMenuButton asChild isActive={active} tooltip={label} className="h-10 text-muted-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground hover:bg-muted hover:text-foreground"><NavLink to={to}><Icon /><span>{label}</span></NavLink></SidebarMenuButton></SidebarMenuItem>;
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="gap-3 border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted text-xs font-semibold text-foreground">{initials(session.profile.fullName || session.profileName)}</span>
        <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium text-foreground">{session.profile.fullName || session.profileName}</p></div>
      </div>
      <VaultSyncFlag directSave={directSave} vault={vault} />
      <Button variant={!directSave && vault.saveState === "dirty" ? "default" : "ghost"} className="h-9 w-full justify-start px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" onClick={() => void saveCopy().then(() => toast.success(directSave ? "Vault copy saved" : "Updated vault downloaded")).catch((error) => { if ((error as DOMException).name !== "AbortError") toast.error(error instanceof Error ? error.message : "Copy failed"); })}><Save /><span className="group-data-[collapsible=icon]:hidden">{directSave ? "Save vault copy" : "Download updated vault"}</span></Button>
      <Button asChild variant="ghost" className="h-9 w-full justify-start px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"><NavLink to="/profiles"><Users /><span className="group-data-[collapsible=icon]:hidden">Switch profile</span></NavLink></Button>
      <Button variant="secondary" className="h-9 w-full justify-start px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" disabled={vault.saveState !== "saved"} onClick={() => void lock()}><LockKeyhole /><span className="group-data-[collapsible=icon]:hidden">Lock vault</span></Button>
      <p className="px-2 text-center text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">Version {APP_VERSION}</p>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}

export function ProtectedLayout() {
  const location = useLocation();
  const { directSave } = useSession();
  return <SidebarProvider defaultOpen>
    <a href="#main-content" className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <AppSidebar />
    <SidebarInset className="min-w-0 bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
        <SidebarTrigger aria-label="Toggle navigation" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{titleFor(location.pathname)}</p><p className="hidden text-xs text-muted-foreground sm:block">Private binder workspace</p></div>
        <ThemeToggle />
      </header>
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-10">{!directSave && <Alert className="mb-6"><CircleAlert /><AlertTitle>Compatibility mode: downloads do not replace your original vault</AlertTitle><AlertDescription>After each change, select <strong>Download updated vault</strong>. Keep the newest file. Chrome, Edge, or another Chromium browser is recommended for automatic in-place saving.</AlertDescription></Alert>}<Outlet /></main>
    </SidebarInset>
  </SidebarProvider>;
}
