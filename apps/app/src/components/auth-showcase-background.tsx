import { DriftWall } from "@/components/drift-wall";

export function AuthShowcaseBackground() {
  return (
    <div
      data-testid="auth-showcase-background"
      className="absolute inset-0 overflow-hidden bg-background"
    >
      <DriftWall
        columns={8}
        tileWidth={120}
        tileHeight={90}
        gap={18}
        tilt={16}
        turn={-6}
        perspective={1200}
        depth={120}
        speed={42}
        direction="up"
        variance={0.45}
        parallax={0.6}
        lift={64}
        fade={0.2}
        dim={0.55}
        overlayColor="#060010"
        radius={14}
        roll={0}
        pauseOnHover={false}
        grayscale={false}
        className="pointer-events-none opacity-50 dark:opacity-60"
      />
      <div className="absolute inset-0 z-30 bg-background/10 dark:bg-background/15" />
      <div
        data-testid="auth-showcase-focus"
        className="absolute inset-0 z-30"
        style={{
          background:
            "radial-gradient(ellipse min(32rem, 46vw) min(30rem, 56vh) at 50% 50%, color-mix(in oklab, var(--color-background) 68%, transparent) 0%, color-mix(in oklab, var(--color-background) 48%, transparent) 50%, color-mix(in oklab, var(--color-background) 18%, transparent) 78%, transparent 100%)",
        }}
      />
    </div>
  );
}
