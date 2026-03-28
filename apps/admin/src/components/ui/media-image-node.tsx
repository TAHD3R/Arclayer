import type { PlateElementProps } from "platejs/react";

import { ImageOff } from "lucide-react";
import { PlateElement } from "platejs/react";

import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";

type ImageElementShape = {
  url?: string;
};

export function MediaImageElement(props: PlateElementProps) {
  const element = props.element as ImageElementShape;
  const url = typeof element.url === "string" ? element.url : "";

  return (
    <PlateElement {...props} as="div" className="my-6">
      <div
        className="relative overflow-hidden rounded-2xl border border-border/70 bg-muted/20"
        contentEditable={false}
      >
        <div className="relative aspect-[16/9]">
          {url ? (
            <LazyAssetImage
              eager
              src={url}
              alt=""
              rootClassName="absolute inset-0"
              className="object-cover"
              showErrorOverlay
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-label-secondary">
              <ImageOff className="size-5" />
            </div>
          )}
        </div>
      </div>
      {props.children}
    </PlateElement>
  );
}
