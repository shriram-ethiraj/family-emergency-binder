import { useEffect } from "react";
import { Outlet } from "react-router";
import { SessionProvider } from "@/app/session-context";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/branding";

export function RootLayout() {
  useEffect(() => {
    document.title = APP_NAME;
    document.querySelector('meta[name="description"]')?.setAttribute("content", APP_DESCRIPTION);
  }, []);
  return <SessionProvider><Outlet /></SessionProvider>;
}
