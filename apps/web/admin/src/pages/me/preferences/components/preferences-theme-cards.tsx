import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/types/stores";

function AdminLayoutMockup(props: { mode: ThemePreference }) {
  const isDark = props.mode === "dark";

  const bg = isDark ? "hsl(0 0% 0%)" : "hsl(0 0% 100%)";
  const panel = isDark ? "hsl(210 11% 10%)" : "hsl(210 30% 96%)";
  const panel2 = isDark ? "hsl(206 12% 18%)" : "hsl(0 0% 100%)";
  const border = isDark ? "hsl(206 7% 20%)" : "hsl(210 14% 89%)";
  const text = isDark ? "hsl(200 7% 91%)" : "hsl(210 25% 8%)";
  const muted = isDark ? "hsl(206 4% 46%)" : "hsl(206 15% 38%)";

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full">
      <rect x="0" y="0" width="320" height="200" rx="14" fill={bg} stroke={border} />

      {/* sidebar */}
      <rect x="14" y="14" width="74" height="172" rx="10" fill={panel} stroke={border} />
      <rect x="26" y="28" width="50" height="10" rx="5" fill={muted} opacity="0.7" />
      <rect x="26" y="52" width="50" height="10" rx="5" fill={muted} opacity="0.45" />
      <rect x="26" y="76" width="50" height="10" rx="5" fill={muted} opacity="0.45" />
      <rect x="26" y="100" width="50" height="10" rx="5" fill={muted} opacity="0.45" />

      {/* header */}
      <rect x="96" y="14" width="210" height="26" rx="10" fill={panel2} stroke={border} />

      {/* content */}
      <rect x="96" y="50" width="210" height="136" rx="12" fill={panel2} stroke={border} />
      <rect x="112" y="68" width="120" height="14" rx="7" fill={text} opacity="0.9" />
      <rect x="112" y="92" width="160" height="10" rx="5" fill={muted} opacity="0.55" />
      <rect x="112" y="112" width="172" height="58" rx="10" fill={panel} opacity={0.6} />
    </svg>
  );
}

export function ThemeCard(props: {
  value: ThemePreference;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={cn(
        "w-full overflow-hidden rounded-lg border text-left",
        "transition-colors",
        props.selected
          ? "border-foreground bg-muted/10"
          : "border-border bg-card hover:bg-muted/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className={cn("w-full p-3", props.selected ? "bg-muted/30" : "bg-muted/15")}>
        <div className="aspect-[16/10] w-full">
          <AdminLayoutMockup mode={props.value} />
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <div
          className={cn(
            "text-headline font-semibold",
            props.selected ? "text-foreground" : "text-label-primary",
          )}
        >
          {props.label}
        </div>
      </div>
    </button>
  );
}
