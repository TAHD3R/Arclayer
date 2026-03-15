import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";

const DEFAULT_DURATION_MS = 4800;
const CAROUSEL_EASE = [0.22, 1, 0.36, 1] as const;

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

function resolveLoopedIndex(nextIndex: number, length: number): number {
  if (length <= 0) return 0;
  if (nextIndex < 0) return length - 1;
  if (nextIndex >= length) return 0;
  return nextIndex;
}

function useCarouselAutoplay(props: { enabled: boolean; durationMs: number; onTick: () => void }) {
  useEffect(() => {
    if (!props.enabled) return;

    const timer = window.setInterval(props.onTick, props.durationMs);
    return () => window.clearInterval(timer);
  }, [props.durationMs, props.enabled, props.onTick]);
}

function CarouselProgress(props: {
  activeIndex: number;
  durationMs: number;
  items: readonly LoadingCarouselItem[];
  reducedMotion: boolean;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      {props.items.map((slide, slideIndex) => {
        const isActive = slideIndex === props.activeIndex;
        const isVisited = slideIndex < props.activeIndex;
        return (
          <button
            key={slide.id}
            type="button"
            aria-label={`${t("auth:AUTH_BRAND_GOTO_SLIDE")} ${slideIndex + 1}`}
            aria-pressed={isActive}
            className="relative -my-2 flex-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            onClick={() => props.onSelect(slideIndex)}
          >
            <span className="relative block h-1.5 overflow-hidden rounded-full bg-white/12 transition-colors hover:bg-white/18">
              {isActive ? (
                <motion.span
                  key={`${slide.id}-${props.activeIndex}`}
                  className="absolute inset-y-0 left-0 block rounded-full bg-white/78"
                  initial={{ width: props.reducedMotion ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={{
                    duration: props.reducedMotion ? 0 : props.durationMs / 1000,
                    ease: "linear",
                  }}
                />
              ) : isVisited ? (
                <span className="absolute inset-0 block rounded-full bg-white/34" />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CarouselArrowControls(props: { onPrevious: () => void; onNext: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-full border border-white/12 bg-white/6 text-white/72 hover:bg-white/12 hover:text-white"
        aria-label={t("auth:AUTH_BRAND_PREVIOUS")}
        onClick={props.onPrevious}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-full border border-white/12 bg-white/6 text-white/72 hover:bg-white/12 hover:text-white"
        aria-label={t("auth:AUTH_BRAND_NEXT")}
        onClick={props.onNext}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export function LoadingCarousel({
  items,
  reducedMotion,
  durationMs = DEFAULT_DURATION_MS,
  onSlideChange,
}: LoadingCarouselProps) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  const showControls = items.length > 1;

  const goToSlide = useCallback(
    (nextIndex: number) => {
      setIndex(resolveLoopedIndex(nextIndex, items.length));
    },
    [items.length],
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

  useCarouselAutoplay({
    enabled: showControls && !reducedMotion,
    durationMs,
    onTick: goToNext,
  });

  if (!item) return null;

  return (
    <div className="grid gap-7 xl:gap-8 select-none">
      <div className="relative min-h-36 xl:min-h-40">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
            transition={{ duration: reducedMotion ? 0 : 0.38, ease: CAROUSEL_EASE }}
            className="grid min-w-0 gap-4"
          >
            <div className="grid min-w-0 gap-2.5">
              <h2 className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(1.72rem,2.8vw,2.95rem)] leading-[0.94] font-medium tracking-[-0.05em] text-white">
                {item.title}
              </h2>
              <p className="max-w-[26rem] text-body leading-relaxed text-white/68 text-pretty">
                {item.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {showControls ? (
        <div className="flex items-center gap-4">
          <CarouselProgress
            activeIndex={index}
            durationMs={durationMs}
            items={items}
            reducedMotion={reducedMotion}
            onSelect={goToSlide}
          />
          <CarouselArrowControls onPrevious={goToPrevious} onNext={goToNext} />
        </div>
      ) : null}
    </div>
  );
}
