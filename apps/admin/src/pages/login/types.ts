import type { LoginMode } from "@/lib/auth/auth-mode";

export interface LoginFormValues {
  account: string;
  password: string;
  keepSession: boolean;
}

export interface RegisterFormValues {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export interface LoginViewProps {
  mode: LoginMode;
  onModeChange: (mode: LoginMode) => void;
  onLoginSubmit: (values: LoginFormValues) => void;
  loginLoading?: boolean;
  initialKeepSession?: boolean;
  redirect?: string | undefined;
  onForgotPassword: (identifier: string) => Promise<void>;
  onRegisterSubmit: (values: RegisterFormValues) => void;
  registerLoading?: boolean;
  publicRegisterEnabled?: boolean;
}
