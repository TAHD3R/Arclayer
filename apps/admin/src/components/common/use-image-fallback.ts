import { useEffect, useState } from "react";

export function useImageFallback(src?: string | null) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return {
    canRenderImage: Boolean(src) && !failed,
    markImageFailed: () => setFailed(true),
  };
}
