import { BootstrapPane } from "./components/bootstrap-pane";
import { InstanceRepairRequiredPane } from "./components/instance-repair-required-pane";
import { useLoginPage } from "./hooks/use-login-page";
import { LoginView } from "./components/login-view";

export function LoginPage() {
  const state = useLoginPage();

  if (state.entry === "bootstrap") {
    return <BootstrapPane {...state.props} />;
  }
  if (state.entry === "repair_required") {
    return <InstanceRepairRequiredPane {...state.props} />;
  }
  return <LoginView {...state.props} />;
}
