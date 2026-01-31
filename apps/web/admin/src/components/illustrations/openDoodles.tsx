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

function applyOpenDoodlesTheme(svg: string): string {
  // 之前用 <style> 注入来“只改黑色”，但 inline SVG 的 <style> 会进入全局 CSS 作用域，
  // 会误伤站内其它 icon（它们同样包含大量 <path>）。
  // 这里改为“只改 SVG 字符串本身的属性”，确保影响域仅限当前 SVG。

  // 1) 把显式黑色 fill/stroke 映射为 currentColor（暗黑模式会自动变亮）
  let out = svg
    .replace(/fill=("|')#000000(\1)/gi, 'fill="currentColor"')
    .replace(/fill=("|')#000(\1)/gi, 'fill="currentColor"')
    .replace(/fill=("|')black(\1)/gi, 'fill="currentColor"')
    .replace(/fill=("|')rgb\\(0\\s*,\\s*0\\s*,\\s*0\\)(\1)/gi, 'fill="currentColor"')
    .replace(/stroke=("|')#000000(\1)/gi, 'stroke="currentColor"')
    .replace(/stroke=("|')#000(\1)/gi, 'stroke="currentColor"')
    .replace(/stroke=("|')black(\1)/gi, 'stroke="currentColor"')
    .replace(/stroke=("|')rgb\\(0\\s*,\\s*0\\s*,\\s*0\\)(\1)/gi, 'stroke="currentColor"');

  // 2) Open Doodles 里不少轮廓使用“默认 fill=black”（元素未声明 fill）。
  // 给 <svg> 根节点补一个默认 fill=currentColor，仅影响未显式声明 fill 的元素。
  // 注意：不要添加 stroke，否则会给未设置 stroke 的形状“凭空加描边”。
  out = out.replace(/<svg\b(?![^>]*\bfill=)/i, '<svg fill="currentColor"');

  return out;
}

function IllustrationFromRaw(props: { svg: string } & IllustrationProps) {
  const decorative = !props.ariaLabel;
  const themedSvg = applyOpenDoodlesTheme(props.svg);

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
