import type { LoginMode } from "@/lib/auth/auth-mode";
import type { AuthChallengeSnapshot } from "@/stores/use-auth-challenge-store";
import type { PendingOAuthProvider } from "@/types/auth/oauth-popup";

export interface BootstrapFormValues {
  displayName: string;
  email: string;
  username: string;
  password: string;
}

export interface LoginFormValues {
  email: string;
  password: string;
  keepSession: boolean;
}

export interface LoginTwoFactorFormValues {
  code?: string;
  backupCode?: string;
}

export interface LoginEmailCodeFormValues {
  email: string;
  code: string;
}

export interface LoginEmailCodeRequestResult {
  expiresIn: number;
  retryAfter: number;
  expires_in?: number;
  retry_after?: number;
}

export interface LoginEmailLookupResult {
  exists: boolean;
  passwordLoginAvailable: boolean;
}

export interface RegisterFormValues {
  email: string;
  username: string;
  password: string;
}

export interface RegisterEmailVerificationState {
  email: string;
  retryAfter: number;
}

export interface EmailVerificationNoticeState {
  open: boolean;
  email?: string;
}

export interface LoginPaneSeed {
  email: string;
  step: "email" | "password";
}

export interface RegisterPaneSeed {
  email: string;
  step: "email" | "details";
}

export interface LoginEmailCodePaneSeed {
  email: string;
  autoRequest?: boolean;
  keepSession?: boolean;
  passwordLoginAvailable?: boolean;
}

export type AuthModeStep = "email" | "password" | "details" | "verify";

export interface LoginModeChangeOptions {
  email?: string;
  step?: AuthModeStep;
  keepSession?: boolean;
  passwordLoginAvailable?: boolean;
}

export interface LoginViewProps {
  mode: LoginMode;
  onModeChange: (mode: LoginMode, options?: LoginModeChangeOptions) => void;
  onLoginEmailSubmit: (email: string) => Promise<LoginEmailLookupResult>;
  onLoginSubmit: (values: LoginFormValues) => Promise<void>;
  loginSeed?: LoginPaneSeed | null;
  loginEmailLoading?: boolean;
  loginLoading?: boolean;
  onLoginEmailCodeRequest: (email: string) => Promise<LoginEmailCodeRequestResult>;
  onLoginEmailCodeVerify: (values: LoginEmailCodeFormValues) => Promise<void>;
  loginEmailCodeSeed?: LoginEmailCodePaneSeed | null;
  loginEmailCodeRequestLoading?: boolean;
  loginEmailCodeVerifyLoading?: boolean;
  redirect?: string | undefined;
  pendingOAuthProvider?: PendingOAuthProvider | null;
  onStartOAuth?: (input: { provider: string; startUrl: string; keepSession: boolean }) => void;
  onForgotPasswordSubmit: (email: string) => Promise<void>;
  forgotPasswordInitialEmail?: string;
  forgotPasswordLoading?: boolean;
  authTransitionLoading?: boolean;
  onRegisterEmailSubmit: (email: string) => Promise<boolean>;
  onRegisterSubmit: (values: RegisterFormValues) => Promise<void>;
  onRegisterVerificationResend: (email: string) => Promise<{ retryAfter: number }>;
  registerVerification?: RegisterEmailVerificationState | null;
  emailVerificationNotice?: EmailVerificationNoticeState;
  onEmailVerificationNoticeOpenChange?: (open: boolean) => void;
  registerSeed?: RegisterPaneSeed | null;
  registerEmailLoading?: boolean;
  registerLoading?: boolean;
  registerResendLoading?: boolean;
  publicRegisterEnabled?: boolean;
  challenge: AuthChallengeSnapshot | null;
  onLoginTwoFactorSubmit: (values: LoginTwoFactorFormValues) => Promise<void>;
  onCancelTwoFactorChallenge: () => void;
  twoFactorLoading?: boolean;
}

export interface BootstrapPaneProps {
  onEmailSubmit: (email: string) => Promise<boolean>;
  onSubmit: (values: BootstrapFormValues) => Promise<void>;
  emailLoading?: boolean;
  loading?: boolean;
}

export interface InstanceRepairRequiredPaneProps {
  repairReason?: string | null;
  onRefresh: () => void;
}
