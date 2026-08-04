import { useLayoutEffect } from "react";

import { activateThemeModeOverride } from "@/stores/use-preference-store";

import { useLoginPage } from "./hooks/use-login-page";
import { LoginView } from "./components/login-view";

export function LoginPage() {
  const state = useLoginPage();

  useLayoutEffect(() => activateThemeModeOverride("dark"), []);

  return <LoginView {...state.props} />;
}
