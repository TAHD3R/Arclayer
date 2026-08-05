export function AuthShowcaseBackground() {
  return (
    <div data-testid="auth-showcase-background" className="absolute inset-0 bg-background">
      <div className="absolute inset-0 z-30 bg-background/10 dark:bg-background/20" />
      <div
        data-testid="auth-showcase-focus"
        className="absolute inset-0 z-30"
        style={{
          background:
            "radial-gradient(ellipse min(31rem, 45vw) min(29rem, 54vh) at 50% 50%, color-mix(in oklab, var(--color-background) 88%, transparent) 0%, color-mix(in oklab, var(--color-background) 74%, transparent) 50%, color-mix(in oklab, var(--color-background) 32%, transparent) 78%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-0 z-30"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in oklab, var(--color-background) 36%, transparent), transparent 20%, transparent 78%, var(--color-background))",
        }}
      />
    </div>
  );
}
