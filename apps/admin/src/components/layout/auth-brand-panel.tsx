import { motion } from "motion/react";
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

  const handleSlideChange = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  return (
    <div className="relative hidden h-full min-h-0 overflow-hidden bg-[#07131c] text-white lg:block">
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        return (
          <motion.img
            key={item.imageSrc}
            aria-hidden
            src={item.imageSrc}
            alt=""
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={index === 0 ? "high" : "auto"}
            className="absolute inset-0 h-full w-full object-cover"
            initial={props.reducedMotion ? false : { opacity: index === 0 ? 1 : 0, scale: 1.015 }}
            animate={
              props.reducedMotion
                ? { opacity: isActive ? 1 : 0 }
                : { opacity: isActive ? 1 : 0, scale: isActive ? 1 : 1.02 }
            }
            transition={{ duration: props.reducedMotion ? 0 : 0.72, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,16,0.42)_0%,rgba(4,10,16,0.28)_22%,rgba(4,10,16,0.52)_54%,rgba(4,10,16,0.82)_100%)]" />

      <div className="absolute inset-0 flex flex-col justify-end p-10 xl:p-16">
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
