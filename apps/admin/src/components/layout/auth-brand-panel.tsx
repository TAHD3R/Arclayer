import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AUTH_BRAND_SLIDES } from "./auth-brand-slides";
import { LoadingCarousel } from "./loading-carousel";

export function AuthBrandPanel(props: { reducedMotion: boolean }) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo(
    () =>
      AUTH_BRAND_SLIDES.map((slide) => ({
        id: slide.id,
        title: t(slide.titleKey),
        description: t(slide.descriptionKey),
        imageSrc: slide.imageSrc,
      })),
    [t],
  );
  const activeItem = items[activeIndex] ?? items[0];

  const handleSlideChange = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  return (
    <div className="relative hidden h-full min-h-0 overflow-hidden bg-[#07131c] text-white lg:block">
      <AnimatePresence mode="sync">
        <motion.img
          key={activeItem?.imageSrc ?? "auth-brand-fallback"}
          aria-hidden
          src={activeItem?.imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={props.reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 1.015 }}
          animate={
            props.reducedMotion
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  scale: 1,
                }
          }
          exit={props.reducedMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: props.reducedMotion ? 0 : 0.72, ease: [0.22, 1, 0.36, 1] }}
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,12,18,0.54)_0%,rgba(5,12,18,0.42)_24%,rgba(4,10,16,0.58)_52%,rgba(4,10,16,0.86)_100%)]" />

      <div className="absolute inset-0 flex flex-col justify-end p-14 xl:p-16">
        <div className="max-w-[46rem] select-none">
          <LoadingCarousel
            items={items}
            reducedMotion={props.reducedMotion}
            onSlideChange={handleSlideChange}
          />
        </div>
      </div>
    </div>
  );
}
