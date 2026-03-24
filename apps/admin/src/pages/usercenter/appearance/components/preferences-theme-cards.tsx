import { cn } from "@arclayer/lib/utils";
import type { ThemePreference } from "@/types/stores";
import { Monitor, Moon, Sun } from "@arclayer/ui/icons/lucide-animated";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";

function AdminLayoutMockupContent({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "hsl(220 10% 8%)" : "hsl(210 30% 98%)";
  const panel = isDark ? "hsl(220 10% 12%)" : "hsl(0 0% 100%)";
  const border = isDark ? "hsl(220 10% 20%)" : "hsl(210 14% 92%)";
  const textTitle = isDark ? "hsl(200 7% 91%)" : "hsl(210 25% 15%)";
  const textBody = isDark ? "hsl(210 4% 60%)" : "hsl(210 10% 45%)";
  const primary = "hsl(220 70% 50%)";

  return (
    <>
      <rect x="0" y="0" width="320" height="200" fill={bg} />

      {/* Sidebar */}
      <rect x="0" y="0" width="70" height="200" fill={panel} stroke={border} strokeWidth="1" />
      <rect
        x="12"
        y="16"
        width="24"
        height="24"
        rx="6"
        fill={primary}
        opacity={isDark ? "0.8" : "0.9"}
      />
      <rect x="44" y="22" width="14" height="12" rx="4" fill={textBody} opacity="0.3" />

      <rect x="12" y="56" width="46" height="8" rx="4" fill={textBody} opacity="0.8" />
      <rect x="12" y="76" width="38" height="8" rx="4" fill={textBody} opacity="0.4" />
      <rect x="12" y="96" width="42" height="8" rx="4" fill={textBody} opacity="0.4" />
      <rect x="12" y="116" width="36" height="8" rx="4" fill={textBody} opacity="0.4" />

      {/* Header */}
      <rect x="70" y="0" width="250" height="40" fill={panel} stroke={border} strokeWidth="1" />
      <rect x="286" y="12" width="16" height="16" rx="8" fill={textBody} opacity="0.5" />

      {/* Content Area */}
      <rect x="90" y="60" width="120" height="12" rx="4" fill={textTitle} />
      <rect x="90" y="80" width="190" height="6" rx="3" fill={textBody} opacity="0.5" />
      <rect x="90" y="92" width="160" height="6" rx="3" fill={textBody} opacity="0.5" />

      {/* Card representations */}
      <rect
        x="90"
        y="116"
        width="95"
        height="64"
        rx="8"
        fill={panel}
        stroke={border}
        strokeWidth="1"
      />
      <rect x="102" y="128" width="40" height="8" rx="4" fill={textTitle} opacity="0.9" />
      <rect x="102" y="144" width="71" height="4" rx="2" fill={textBody} opacity="0.4" />
      <rect x="102" y="154" width="55" height="4" rx="2" fill={textBody} opacity="0.4" />

      <rect
        x="195"
        y="116"
        width="95"
        height="64"
        rx="8"
        fill={panel}
        stroke={border}
        strokeWidth="1"
      />
      <rect x="207" y="128" width="40" height="8" rx="4" fill={textTitle} opacity="0.9" />
      <rect x="207" y="144" width="71" height="4" rx="2" fill={textBody} opacity="0.4" />
    </>
  );
}

function AdminLayoutMockup(props: { mode: ThemePreference }) {
  if (props.mode === "system") {
    return (
      <svg viewBox="0 0 320 200" className="block h-full w-full">
        <defs>
          <clipPath id="left-half">
            <rect x="0" y="0" width="160" height="200" />
          </clipPath>
          <clipPath id="right-half">
            <rect x="160" y="0" width="160" height="200" />
          </clipPath>
        </defs>
        <g clipPath="url(#left-half)">
          <AdminLayoutMockupContent isDark={false} />
        </g>
        <g clipPath="url(#right-half)">
          <AdminLayoutMockupContent isDark={true} />
        </g>
        {/* Subtle divider line in the middle */}
        <line
          x1="160"
          y1="0"
          x2="160"
          y2="200"
          stroke="hsl(206 10% 50%)"
          strokeOpacity="0.3"
          strokeWidth="1"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 320 200" className="block h-full w-full">
      <AdminLayoutMockupContent isDark={props.mode === "dark"} />
    </svg>
  );
}

export function ThemeCard(props: {
  value: ThemePreference;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  const Icon = props.value === "system" ? Monitor : props.value === "dark" ? Moon : Sun;

  return (
    <ButtonPrimitive
      type="button"
      tapScale={1}
      onClick={props.onSelect}
      className={cn(
        "w-full overflow-hidden rounded-xl border text-left",
        "transition-all duration-200",
        props.selected
          ? "border-primary bg-background ring-1 ring-primary shadow-sm"
          : "border-border/60 bg-background hover:bg-muted/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className="p-3">
        <div
          className={cn(
            "w-full aspect-[16/10] overflow-hidden rounded-lg",
            "ring-1",
            props.selected ? "ring-primary/20 bg-primary/5" : "ring-border/60 bg-muted/10",
          )}
        >
          <AdminLayoutMockup mode={props.value} />
        </div>
      </div>

      <div
        className={cn(
          "border-t px-4 py-3",
          props.selected ? "border-primary/20" : "border-border/60",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 text-footnote font-medium",
            props.selected ? "text-primary" : "text-label-primary",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{props.label}</span>
        </div>
      </div>
    </ButtonPrimitive>
  );
}
