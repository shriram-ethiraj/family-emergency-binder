import { createHashRouter, type RouteObject } from "react-router";
import { NotFoundPage } from "@/app/not-found";
import { ProtectedLayout } from "@/app/protected-layout";
import { PublicLayout } from "@/app/public-layout";
import { RootLayout } from "@/app/root-layout";
import { ProtectedRoute, PublicOnlyRoute, RootRedirect, TemplateRequiredRoute } from "@/app/route-guards";
import { RouteErrorPage } from "@/app/route-error";
import { FullScreenLoading } from "@/components/shared/loading";
import { Component as LoginPage } from "@/features/auth/login-page";
import { Component as RegisterPage } from "@/features/auth/register-page";
import { Component as RecoverPage } from "@/features/auth/recover-page";
import { Component as RecoveryKeyPage } from "@/features/auth/recovery-key-page";
import { Component as ProfilePickerPage } from "@/features/auth/profile-picker-page";
import { Component as TemplateSetupPage } from "@/features/auth/template-setup-page";
import { Component as RecordsWorkspace } from "@/features/records/records-workspace";
import { Component as RecordEditorPage } from "@/features/records/record-editor-page";
import { Component as RevisionsRoute } from "@/features/records/revisions-route";
import { Component as GenerateRoute } from "@/features/records/generate-route";
import { Component as TemplatesPage } from "@/features/templates/templates-page";
import { Component as SettingsPage } from "@/features/settings/settings-page";

export const appRoutes = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: FullScreenLoading,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        element: <PublicLayout />,
        children: [{ path: "setup/templates", element: <TemplateSetupPage /> }],
      },
      {
        element: <TemplateRequiredRoute />,
        children: [
          {
            element: <PublicOnlyRoute />,
            children: [
              {
                element: <PublicLayout />,
                children: [
                  { path: "login", element: <LoginPage /> },
                  { path: "register", element: <RegisterPage /> },
                  { path: "recover", element: <RecoverPage /> },
                  { path: "profiles", element: <ProfilePickerPage /> },
                ],
              },
            ],
          },
          { path: "recovery-key", element: <RecoveryKeyPage /> },
          {
            element: <ProtectedRoute />,
            children: [{
              element: <ProtectedLayout />,
              children: [
                {
                  path: "documents",
                  element: <RecordsWorkspace />,
                  children: [
                    { path: ":documentId/revisions", element: <RevisionsRoute /> },
                    { path: ":documentId/generate", element: <GenerateRoute /> },
                  ],
                },
                { path: "documents/new", element: <RecordEditorPage /> },
                { path: "documents/:documentId/edit", element: <RecordEditorPage /> },
                { path: "templates", element: <TemplatesPage /> },
                { path: "settings", element: <SettingsPage /> },
              ],
            }],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
] satisfies RouteObject[];

export const router = createHashRouter(appRoutes);
