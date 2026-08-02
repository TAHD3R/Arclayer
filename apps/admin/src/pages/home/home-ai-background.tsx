import Aurora from "@/components/Aurora";
import { usePreferencesStore } from "@/stores/use-preference-store";

const HOME_AURORA_COLOR_STOPS = {
  light: ["#6f9dcc", "#aab8ca", "#6f9dcc"],
  dark: ["#339cff", "#526477", "#339cff"],
} satisfies Record<"light" | "dark", [string, string, string]>;

const HOME_AURORA_EDGE_GLOW = {
  light: {
    background:
      "linear-gradient(to top,rgba(111,157,204,0.1),rgba(111,157,204,0.035) 68%,transparent),radial-gradient(ellipse 92% 170% at 50% 118%,rgba(111,157,204,0.14),transparent 80%),radial-gradient(ellipse 52% 88% at 6% 112%,rgba(111,157,204,0.22),transparent 70%),radial-gradient(ellipse 58% 92% at 94% 112%,rgba(170,184,202,0.22),transparent 68%)",
  },
  dark: {
    background:
      "linear-gradient(to top,rgba(51,156,255,0.26),rgba(51,156,255,0.08) 72%,transparent),radial-gradient(ellipse 92% 170% at 50% 118%,rgba(51,156,255,0.34),transparent 80%),radial-gradient(ellipse 52% 88% at 6% 112%,rgba(51,156,255,0.74),transparent 70%),radial-gradient(ellipse 58% 92% at 94% 112%,rgba(82,100,119,0.72),transparent 68%)",
  },
} satisfies Record<"light" | "dark", { background: string }>;

export function HomeAIBackground() {
  const themeMode = usePreferencesStore((state) => state.themeMode);

  return (
    <div
      aria-hidden="true"
      data-testid="home-ai-aurora"
      className="pointer-events-none sticky top-0 z-0 -mb-[100dvh] h-[100dvh] w-full shrink-0"
    >
      <div data-slot="home-aurora-viewport" className="relative h-full overflow-hidden">
        <div
          data-slot="home-aurora-edge-glow"
          className="absolute inset-x-0 bottom-0 h-[clamp(16rem,42svh,28rem)] opacity-35 dark:opacity-80"
          style={HOME_AURORA_EDGE_GLOW[themeMode]}
        />
        <div
          data-slot="home-aurora-canvas"
          className="absolute inset-x-0 bottom-0 h-[clamp(16rem,42svh,28rem)] rotate-180 opacity-40 [mask-image:linear-gradient(to_top,black_4%,rgba(0,0,0,0.92)_54%,transparent_100%)] dark:mix-blend-screen dark:opacity-85"
        >
          <Aurora
            colorStops={HOME_AURORA_COLOR_STOPS[themeMode]}
            amplitude={1.32}
            blend={0.62}
            speed={0.26}
            luminanceLift={themeMode === "light" ? 0.42 : 0.12}
          />
        </div>
      </div>
    </div>
  );
}
