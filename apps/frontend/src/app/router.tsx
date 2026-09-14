import { createBrowserRouter, type RouteObject } from "react-router";
import { NotFoundPage } from "@/app/not-found";
import { ProtectedLayout } from "@/app/protected-layout";
import { PublicLayout } from "@/app/public-layout";
import { RootLayout } from "@/app/root-layout";
import { ProtectedRoute, PublicOnlyRoute, RootRedirect } from "@/app/route-guards";
import { RouteErrorPage } from "@/app/route-error";
import { FullScreenLoading } from "@/components/shared/loading";

export const appRoutes = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: FullScreenLoading,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        element: <PublicOnlyRoute />,
        children: [{
          element: <PublicLayout />,
          children: [
            { path: "login", lazy: () => import("@/features/auth/login-page") },
            { path: "register", lazy: () => import("@/features/auth/register-page") },
            { path: "recover", lazy: () => import("@/features/auth/recover-page") },
          ],
        }],
      },
      { path: "recovery-key", lazy: () => import("@/features/auth/recovery-key-page") },
      {
        element: <ProtectedRoute />,
        children: [{
          element: <ProtectedLayout />,
          children: [
            {
              path: "documents",
              lazy: () => import("@/features/records/records-workspace"),
              children: [
                { path: ":documentId/revisions", lazy: () => import("@/features/records/revisions-route") },
                { path: ":documentId/generate", lazy: () => import("@/features/records/generate-route") },
              ],
            },
            { path: "documents/new", lazy: () => import("@/features/records/record-editor-page") },
            { path: "documents/:documentId/edit", lazy: () => import("@/features/records/record-editor-page") },
            { path: "templates", lazy: () => import("@/features/templates/templates-page") },
            { path: "generated-files", lazy: () => import("@/features/documents/documents-page") },
            { path: "settings", lazy: () => import("@/features/settings/settings-page") },
          ],
        }],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
] satisfies RouteObject[];

export const router = createBrowserRouter(appRoutes);
