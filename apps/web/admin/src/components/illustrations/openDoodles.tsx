import { cn } from "@/lib/utils";

import clumsySvg from "@/assets/illustrations/open-doodles-clumsy-man-dropping-documents-and-files.svg?raw";
import zombieSvg from "@/assets/illustrations/open-doodles-man-dancing-like-zombie.svg?raw";
import chillingSvg from "@/assets/illustrations/open-doodles-man-sitting-and-chilling.svg?raw";
import skatingSvg from "@/assets/illustrations/open-doodles-roller-skating.svg?raw";
import houseplantSvg from "@/assets/illustrations/open-doodles-woman-taking-care-of-her-houseplant.svg?raw";

export type IllustrationProps = {
  className?: string;
  /**
   * 默认视为装饰图（aria-hidden=true）。
   * 如需可访问性描述，传入 ariaLabel。
   */
  ariaLabel?: string;
};

function injectOpenDoodlesTheme(svg: string): string {
  // Open Doodles 的 SVG 里有大量“黑色填充/描边”以及“未声明 fill/stroke 的元素（默认黑色）”。
  // 为了在暗黑模式下仍然可见，我们只把“黑色/默认黑色”的部分映射到 currentColor，
  // 并让 wrapper 使用 text-foreground 作为 currentColor 来源。
  const css = `
    /* Normalize black/default shapes to currentColor (works for both light/dark). */
    :is(path,circle,rect,polygon,polyline,ellipse,line)[fill="#000"],
    :is(path,circle,rect,polygon,polyline,ellipse,line)[fill="#000000"],
    :is(path,circle,rect,polygon,polyline,ellipse,line)[fill="black"],
    :is(path,circle,rect,polygon,polyline,ellipse,line)[fill="rgb(0,0,0)"] { fill: currentColor; }

    :is(path,circle,rect,polygon,polyline,ellipse,line)[stroke="#000"],
    :is(path,circle,rect,polygon,polyline,ellipse,line)[stroke="#000000"],
    :is(path,circle,rect,polygon,polyline,ellipse,line)[stroke="black"],
    :is(path,circle,rect,polygon,polyline,ellipse,line)[stroke="rgb(0,0,0)"] { stroke: currentColor; }

    /* Elements without explicit fill default to black; map them to currentColor as well. */
    :is(path,circle,rect,polygon,polyline,ellipse)[fill]:not([fill="none"]) { }
    :is(path,circle,rect,polygon,polyline,ellipse):not([fill]) { fill: currentColor; }
  `.trim();

  const idx = svg.indexOf(">");
  if (idx === -1) return svg;
  return `${svg.slice(0, idx + 1)}<style>${css}</style>${svg.slice(idx + 1)}`;
}

function IllustrationFromRaw(props: { svg: string } & IllustrationProps) {
  const decorative = !props.ariaLabel;
  const themedSvg = injectOpenDoodlesTheme(props.svg);

  return (
    <div
      role={decorative ? undefined : "img"}
      aria-label={props.ariaLabel}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        // 强制 currentColor 来源为前景色，配合注入的 SVG style 在暗黑模式下也能看清黑线条。
        "block w-full max-w-[420px] text-foreground [&>svg]:w-full [&>svg]:h-auto",
        props.className,
      )}
      // SVG 源文件较大且属性多，使用 raw + innerHTML 避免手动转换属性命名。
      dangerouslySetInnerHTML={{ __html: themedSvg }}
    />
  );
}

export function OpenDoodlesClumsy(props: IllustrationProps) {
  return <IllustrationFromRaw svg={clumsySvg} {...props} />;
}

export function OpenDoodlesZombie(props: IllustrationProps) {
  return <IllustrationFromRaw svg={zombieSvg} {...props} />;
}

export function OpenDoodlesChilling(props: IllustrationProps) {
  return <IllustrationFromRaw svg={chillingSvg} {...props} />;
}

export function OpenDoodlesSkating(props: IllustrationProps) {
  return <IllustrationFromRaw svg={skatingSvg} {...props} />;
}

export function OpenDoodlesHouseplant(props: IllustrationProps) {
  return <IllustrationFromRaw svg={houseplantSvg} {...props} />;
}
