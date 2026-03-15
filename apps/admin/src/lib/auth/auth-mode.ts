export type LoginMode = "login" | "register" | "forgot-password";

export function resolveLoginMode(mode: LoginMode, publicRegisterEnabled: boolean): LoginMode {
  if (!publicRegisterEnabled && mode === "register") {
    return "login";
  }
  return mode;
}
