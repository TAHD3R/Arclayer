import type { LoginMode } from "@/lib/auth/auth-mode";
import type { AuthChallengeSnapshot } from "@/stores/use-auth-challenge-store";

export interface LoginFormValues {
  account: string;
  password: string;
  keepSession: boolean;
}

export interface LoginTwoFactorFormValues {
  code?: string;
  backupCode?: string;
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
  onForgotPasswordSubmit: (identifier: string) => Promise<void>;
  forgotPasswordLoading?: boolean;
  onRegisterSubmit: (values: RegisterFormValues) => void;
  registerLoading?: boolean;
  publicRegisterEnabled?: boolean;
  challenge: AuthChallengeSnapshot | null;
  onLoginTwoFactorSubmit: (values: LoginTwoFactorFormValues) => void;
  onCancelTwoFactorChallenge: () => void;
  twoFactorLoading?: boolean;
}
