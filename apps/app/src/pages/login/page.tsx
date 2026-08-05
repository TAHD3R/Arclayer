import { useLoginPage } from "./hooks/use-login-page";
import { LoginView } from "./components/login-view";

export function LoginPage() {
  const state = useLoginPage();

  return <LoginView {...state.props} />;
}
