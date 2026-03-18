export interface IllustrationProps {
  className?: string;
  /**
   * Optional app-level reduced-motion preference.
   * When true, illustrations skip their internal motion sequences.
   */
  reducedMotion?: boolean;
  /**
   * 默认视为装饰图（aria-hidden=true）。
   * 如需可访问性描述，传入 ariaLabel。
   */
  ariaLabel?: string;
}
