import { FALLBACK_PRIMARY_BEND_COLOR } from "./constants";

export function resolvePortalOrigin(): string {
  const raw = (import.meta.env.VITE_PORTAL_ORIGIN || "").trim();
  if (raw) return raw;
  return "http://localhost:3100";
}

export function resolveSetupDryRunFlag(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("__dev_setup") === "1";
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function toHex(value: number): string {
  const safe = Math.max(0, Math.min(255, Math.round(value)));
  return safe.toString(16).padStart(2, "0");
}

export function resolvePrimaryBendColor(): string {
  if (typeof document === "undefined") {
    return FALLBACK_PRIMARY_BEND_COLOR;
  }

  const probe = document.createElement("span");
  probe.className = "text-primary";
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.textContent = ".";
  document.body.appendChild(probe);

  try {
    const color = getComputedStyle(probe).color;
    const values = color.match(/[\d.]+/g);
    if (!values || values.length < 3) {
      return FALLBACK_PRIMARY_BEND_COLOR;
    }

    const [r, g, b] = values.slice(0, 3).map((v) => Number(v));
    if ([r, g, b].some((v) => Number.isNaN(v))) {
      return FALLBACK_PRIMARY_BEND_COLOR;
    }

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } finally {
    probe.remove();
  }
}
