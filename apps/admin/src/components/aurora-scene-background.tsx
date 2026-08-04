import Aurora from "@/components/Aurora";
import { usePreferencesStore } from "@/stores/use-preference-store";

const AURORA_COLOR_STOPS: [string, string, string] = ["#339cff", "#526477", "#339cff"];

type AuroraSceneBackgroundProps = {
  testId?: string;
};

export function AuroraSceneBackground({ testId }: AuroraSceneBackgroundProps) {
  const themeMode = usePreferencesStore((state) => state.themeMode);

  return (
    <div
      data-testid={testId}
      className="h-1/2 w-full opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]"
    >
      <Aurora
        colorStops={AURORA_COLOR_STOPS}
        amplitude={0.8}
        blend={0.75}
        speed={0.35}
        luminanceLift={themeMode === "light" ? 1 : 0}
      />
    </div>
  );
}
