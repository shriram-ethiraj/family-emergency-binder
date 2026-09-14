import { RouterProvider } from "react-router";
import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";

export function App() {
  return <AppProviders><RouterProvider router={router} /></AppProviders>;
}
