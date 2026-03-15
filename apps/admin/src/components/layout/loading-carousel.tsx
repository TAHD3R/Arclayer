import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";

export type LoadingCarouselItem = {
  id: string;
  title: string;
  description: string;
  imageSrc: string;
};

type LoadingCarouselProps = {
  items: readonly LoadingCarouselItem[];
  reducedMotion: boolean;
  durationMs?: number;
  onSlideChange?: (index: number) => void;
};

export function LoadingCarousel({
  items,
  reducedMotion,
  durationMs = 4800,
  onSlideChange,
}: LoadingCarouselProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);

  const commitSlide = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
  }, []);

  const clampIndex = useCallback(
    (nextIndex: number) => {
      if (items.length === 0) return 0;
      if (nextIndex < 0) return items.length - 1;
      if (nextIndex >= items.length) return 0;
      return nextIndex;
    },
    [items.length],
  );

  const goToSlide = useCallback(
    (nextIndex: number) => {
      commitSlide(clampIndex(nextIndex));
    },
    [clampIndex, commitSlide],
  );

  const goToPrevious = useCallback(() => {
    goToSlide(index - 1);
  }, [goToSlide, index]);

  const goToNext = useCallback(() => {
    goToSlide(index + 1);
  }, [goToSlide, index]);

  useEffect(() => {
    onSlideChange?.(index);
  }, [index, onSlideChange]);

  useEffect(() => {
    if (items.length <= 1 || reducedMotion) return;

    const timer = window.setInterval(() => {
      commitSlide(index === items.length - 1 ? 0 : index + 1);
    }, durationMs);

    return () => window.clearInterval(timer);
  }, [commitSlide, durationMs, index, items.length, reducedMotion]);

  const item = items[index];

  return (
    <div className="grid gap-8 select-none">
      <div className="relative min-h-40">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
            transition={{ duration: reducedMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-5"
          >
            <div className="grid gap-3">
              <h2 className="max-w-none whitespace-nowrap text-[clamp(1.9rem,3vw,3.2rem)] leading-[0.94] font-medium tracking-[-0.05em] text-white">
                {item.title}
              </h2>
              <p className="max-w-[28rem] text-title3 leading-relaxed text-white/68">
                {item.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-1 items-center gap-2.5">
          {items.map((slide, slideIndex) => {
            const isActive = slideIndex === index;
            return (
              <button
                key={slide.id}
                type="button"
                aria-label={`${t("auth:AUTH_BRAND_GOTO_SLIDE")} ${slideIndex + 1}`}
                className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/12 transition-colors hover:bg-white/18"
                onClick={() => goToSlide(slideIndex)}
              >
                {isActive ? (
                  <motion.div
                    key={`${slide.id}-${index}`}
                    className="absolute inset-y-0 left-0 rounded-full bg-white/75"
                    initial={{ width: reducedMotion ? "100%" : "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: reducedMotion ? 0 : durationMs / 1000, ease: "linear" }}
                  />
                ) : slideIndex < index ? (
                  <div className="absolute inset-0 rounded-full bg-white/32" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full border border-white/12 bg-white/6 text-white/72 hover:bg-white/12 hover:text-white"
            aria-label={t("auth:AUTH_BRAND_PREVIOUS")}
            onClick={goToPrevious}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full border border-white/12 bg-white/6 text-white/72 hover:bg-white/12 hover:text-white"
            aria-label={t("auth:AUTH_BRAND_NEXT")}
            onClick={goToNext}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
