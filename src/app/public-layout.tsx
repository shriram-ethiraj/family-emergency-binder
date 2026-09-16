import { CheckCircle2, HardDrive, LockKeyhole, ShieldCheck } from "lucide-react";
import { Outlet } from "react-router";
import { Brand } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SetupChecklist } from "@/components/shared/setup-checklist";
import { APP_TAGLINE, APP_VERSION } from "@/lib/branding";

export function PublicLayout() {
  return (
    <main className="relative grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]">
      <div className="absolute right-5 top-5 z-10"><ThemeToggle /></div>
      <section className="hidden overflow-hidden border-r bg-background p-10 text-foreground lg:flex lg:flex-col xl:p-16" aria-label="Privacy overview">
        <Brand />
        <div className="my-auto max-w-xl py-16">
          <div className="mb-8 grid size-16 place-items-center rounded-2xl border bg-primary/10 text-primary"><ShieldCheck className="size-8" /></div>
          <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-[-0.035em] xl:text-5xl">{APP_TAGLINE}</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">Your records stay encrypted on this computer. Create protected documents for your emergency binder without sending private information anywhere else.</p>
          <ul className="mt-10 grid gap-4 text-sm text-foreground sm:grid-cols-2">
            <li className="flex items-center gap-3"><LockKeyhole className="size-4 text-primary" />Encrypted at rest</li>
            <li className="flex items-center gap-3"><CheckCircle2 className="size-4 text-primary" />Revision history</li>
            <li className="flex items-center gap-3"><HardDrive className="size-4 text-primary" />Stored locally</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-primary" />Protected PDFs</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Private by design · No telemetry · Runs from a local folder · v{APP_VERSION}</p>
      </section>
      <section className="flex min-h-svh items-center justify-center px-5 py-16 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <SetupChecklist />
          <Outlet />
          <p className="mt-8 text-center text-xs text-muted-foreground lg:hidden">Runs from a local folder · v{APP_VERSION}</p>
        </div>
      </section>
    </main>
  );
}
