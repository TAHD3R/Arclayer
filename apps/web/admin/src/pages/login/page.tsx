import { useLoginPage } from "./hooks/use-login-page";
import { LoginView } from "./components/login-view";

export function LoginPage() {
  const props = useLoginPage();
  return <LoginView {...props} />;
}
