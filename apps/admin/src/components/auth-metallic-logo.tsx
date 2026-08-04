export function AuthMetallicLogo() {
  return (
    <div
      data-testid="auth-metallic-logo"
      className="relative size-12 select-none md:size-16"
      aria-hidden="true"
    >
      <img
        alt=""
        data-testid="auth-hero-logo-light"
        className="size-full object-contain dark:hidden"
        draggable={false}
        src="/logo.svg"
      />
      <img
        alt=""
        data-testid="auth-hero-logo-dark"
        className="hidden size-full object-contain dark:block"
        draggable={false}
        src="/logo-dark.svg"
      />
    </div>
  );
}
