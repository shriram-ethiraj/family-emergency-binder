import { FileClock, FileText, Files, LockKeyhole, Settings } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useSession } from "@/app/session-context";
import { Brand } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
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
import { initials } from "@/lib/format";

const navigation = [
  { to: "/documents", label: "Documents", icon: Files },
  { to: "/templates", label: "Print templates", icon: FileText },
  { to: "/generated-files", label: "Generated PDFs", icon: FileClock },
  { to: "/settings", label: "Profile settings", icon: Settings },
];

function titleFor(pathname: string) {
  if (pathname === "/documents/new") return "Create document";
  if (/^\/documents\/[^/]+\/edit$/.test(pathname)) return "Edit document";
  if (pathname.startsWith("/templates")) return "Print templates";
  if (pathname.startsWith("/generated-files")) return "Generated PDFs";
  if (pathname.startsWith("/settings")) return "Profile settings";
  return "Documents";
}

function AppSidebar() {
  const { session, lock } = useSession();
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
      <Button variant="secondary" className="h-9 w-full justify-start px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" onClick={() => void lock()}><LockKeyhole /><span className="group-data-[collapsible=icon]:hidden">Lock profile</span></Button>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}

export function ProtectedLayout() {
  const location = useLocation();
  return <SidebarProvider defaultOpen>
    <a href="#main-content" className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <AppSidebar />
    <SidebarInset className="min-w-0 bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
        <SidebarTrigger aria-label="Toggle navigation" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{titleFor(location.pathname)}</p><p className="hidden text-xs text-muted-foreground sm:block">Private binder workspace</p></div>
        <ThemeToggle />
      </header>
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-10"><Outlet /></main>
    </SidebarInset>
  </SidebarProvider>;
}
