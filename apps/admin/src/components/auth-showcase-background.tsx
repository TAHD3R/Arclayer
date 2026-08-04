import Aurora from "@/components/Aurora";
import CardSwap, { Card } from "@/components/CardSwap";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePreferencesStore } from "@/stores/use-preference-store";

const AURORA_COLOR_STOPS: [string, string, string] = ["#339cff", "#526477", "#339cff"];

const SITE_SHOWCASES = [
  "/inspiration/agency-report.jpg",
  "/inspiration/architecture-index.jpg",
  "/inspiration/hospitality-room.jpg",
] as const;

const BROWSER_CARD_CLASS =
  "overflow-hidden rounded-[1.75rem]! border-border/75! bg-card! ring-1 ring-inset ring-white/10 shadow-[0_36px_120px_color-mix(in_oklab,var(--color-foreground)_28%,transparent),inset_0_1px_0_rgba(255,255,255,0.16)]";

function BrowserPreview(props: { image: string }) {
  return (
    <div
      data-testid="auth-browser-frame"
      className="relative flex size-full flex-col overflow-hidden rounded-[inherit] bg-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
    >
      <div className="relative shrink-0 border-b border-foreground/15 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--color-card)_86%,white_14%),color-mix(in_oklab,var(--color-card)_96%,black_4%))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
        <div className="relative flex h-9 items-center px-3">
          <div data-testid="auth-browser-window-controls" className="flex items-center gap-1.5">
            <span className="size-2 rounded-full border border-black/15 bg-[#ff5f57] shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_1px_1px_rgba(0,0,0,0.16)]" />
            <span className="size-2 rounded-full border border-black/15 bg-[#febc2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_1px_1px_rgba(0,0,0,0.16)]" />
            <span className="size-2 rounded-full border border-black/15 bg-[#28c840] shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_1px_1px_rgba(0,0,0,0.16)]" />
          </div>
          <div className="pointer-events-none absolute inset-x-16 bottom-0 flex justify-center">
            <div
              data-testid="auth-browser-tab"
              className="flex h-7 w-[48%] min-w-28 max-w-44 items-center gap-2 rounded-t-[0.65rem] border border-b-0 border-foreground/15 bg-card/88 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
            >
              <span className="size-2.5 rounded-[0.2rem] border border-foreground/10 bg-primary/70" />
              <span className="h-1.5 min-w-0 flex-1 rounded-full bg-foreground/16" />
              <span className="size-1.5 rounded-full bg-foreground/14" />
            </div>
          </div>
        </div>
        <div className="flex h-7 items-center gap-2 border-t border-foreground/8 bg-card/92 px-3">
          <span className="h-2 w-2 rotate-45 border-b border-l border-foreground/32" />
          <span className="h-2 w-2 rotate-45 border-t border-r border-foreground/18" />
          <span className="size-2 rounded-full border border-foreground/25 border-r-transparent" />
          <div
            data-testid="auth-browser-address"
            className="flex h-4 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-foreground/12 bg-background/48 px-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),0_1px_0_rgba(255,255,255,0.08)]"
          >
            <span className="size-1.5 rounded-full border border-foreground/25" />
            <span className="h-1 flex-1 rounded-full bg-foreground/10" />
          </div>
          <span className="size-2.5 rounded-[0.2rem] border border-foreground/22" />
        </div>
      </div>
      <img
        alt=""
        className="min-h-0 w-full flex-1 object-cover"
        decoding="async"
        draggable={false}
        src={props.image}
      />
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
    </div>
  );
}

function SiteCardSwap(props: { reducedMotion: boolean }) {
  const dimensions = {
    width: "clamp(19rem, 31vw, 30rem)",
    height: "clamp(12rem, 21vw, 19rem)",
  } as const;

  if (props.reducedMotion) {
    return (
      <div
        data-testid="auth-card-swap-static"
        className={`absolute right-[-3rem] bottom-[-2rem] rotate-[-4deg] ${BROWSER_CARD_CLASS}`}
        style={dimensions}
      >
        <BrowserPreview image={SITE_SHOWCASES[0]} />
      </div>
    );
  }

  return (
    <CardSwap
      width={dimensions.width}
      height={dimensions.height}
      cardDistance={42}
      verticalDistance={52}
      delay={4_800}
      skewAmount={4}
      easing="elastic"
    >
      {SITE_SHOWCASES.map((image) => (
        <Card key={image} customClass={BROWSER_CARD_CLASS}>
          <BrowserPreview image={image} />
        </Card>
      ))}
    </CardSwap>
  );
}

export function AuthShowcaseBackground() {
  const reducedMotion = usePrefersReducedMotion();
  const themeMode = usePreferencesStore((state) => state.themeMode);

  return (
    <div data-testid="auth-showcase-background" className="absolute inset-0 bg-background">
      <div
        data-testid="auth-background-aurora"
        className="absolute inset-x-0 top-0 z-0 h-[72%] overflow-hidden opacity-30 [mask-image:linear-gradient(to_bottom,black_0%,black_48%,transparent_100%)] dark:opacity-40"
      >
        <Aurora
          colorStops={AURORA_COLOR_STOPS}
          amplitude={0.8}
          blend={0.75}
          speed={0.3}
          luminanceLift={themeMode === "light" ? 1 : 0}
        />
      </div>

      <div
        data-testid="auth-background-card-swap"
        className="absolute inset-0 z-10 hidden opacity-35 md:block dark:opacity-55"
      >
        <SiteCardSwap reducedMotion={reducedMotion} />
      </div>

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
