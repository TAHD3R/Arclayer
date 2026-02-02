import React, { useEffect, useState } from "react";

export function HydrationStatus() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      data-celestial="hydration"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid var(--color-border, rgba(17, 24, 39, 0.12))",
        background: "rgba(0, 0, 0, 0.03)",
        fontSize: 12,
      }}
    >
      <span>Hydration:</span>
      <strong>{hydrated ? "on" : "off"}</strong>
    </div>
  );
}
