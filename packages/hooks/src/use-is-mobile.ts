import { useMediaQuery } from "./use-media-query";

const MOBILE_MEDIA_QUERY = "(max-width: 768px)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
