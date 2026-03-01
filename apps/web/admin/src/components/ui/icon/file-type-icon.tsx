import type { SVGProps } from "react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

export type FileIconTheme = "light" | "dark";
export type FileIconAutoTheme = FileIconTheme | "auto";

export type FileTypeIconName = "empty" | "image" | "audio" | "video" | "pdf" | "zip" | "document";

export interface FileTypeIconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  filename?: string;
  mimeType?: string;
  type?: FileTypeIconName;
  theme?: FileIconAutoTheme;
  size?: number;
}

function normalizeExtension(filename: string | undefined): string | null {
  if (!filename) return null;
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || ext === filename.toLowerCase()) return null;
  return ext;
}

function detectTypeFromMime(mimeType: string | undefined): FileTypeIconName | null {
  if (!mimeType) return null;
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("zip") || mime.includes("compressed")) return "zip";
  return "document";
}

function detectTypeFromExtension(ext: string | null): FileTypeIconName | null {
  if (!ext) return null;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["mp3", "wav", "aac", "flac", "m4a", "ogg"].includes(ext)) return "audio";
  if (["mp4", "mov", "mkv", "avi", "webm", "mpeg"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "zip";
  return "document";
}

function getStroke(theme: FileIconTheme): string {
  return theme === "light" ? "#D5D7DA" : "#373A41";
}

function SvgSize(props: { size?: number }): { width: number | string; height: number | string } {
  if (props.size) return { width: props.size, height: props.size };
  return { width: "100%", height: "100%" };
}

function EmptyIcon(
  props: { theme: FileIconTheme } & Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
      size?: number;
    },
) {
  const { theme, size, ...rest } = props;
  const stroke = getStroke(theme);
  const { width, height } = SvgSize({ size });

  return (
    <svg width={width} height={height} fill="none" viewBox="0 0 40 40" aria-hidden="true" {...rest}>
      <path
        stroke={stroke}
        strokeWidth={1.5}
        d="M4.75 4A3.25 3.25 0 0 1 8 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 32 39.25H8A3.25 3.25 0 0 1 4.75 36z"
      />
      <path stroke={stroke} strokeWidth={1.5} d="M24 .5V8a4 4 0 0 0 4 4h7.5" />
    </svg>
  );
}

function DocumentIcon(
  props: { theme: FileIconTheme } & Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
      size?: number;
    },
) {
  const { theme, size, ...rest } = props;
  const stroke = getStroke(theme);
  const accent = theme === "light" ? "#155EEF" : "#528BFF";
  const { width, height } = SvgSize({ size });

  return (
    <svg width={width} height={height} fill="none" viewBox="0 0 40 40" aria-hidden="true" {...rest}>
      <path
        stroke={stroke}
        strokeWidth={1.5}
        d="M4.75 4A3.25 3.25 0 0 1 8 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 32 39.25H8A3.25 3.25 0 0 1 4.75 36z"
      />
      <path stroke={stroke} strokeWidth={1.5} d="M24 .5V8a4 4 0 0 0 4 4h7.5" />
      <path
        stroke={accent}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11.9 19.5h16.2m-16.2 3.6h16.2m-16.2 3.6h16.2m-16.2 3.6h12.6"
      />
    </svg>
  );
}

function ImageIcon(
  props: { theme: FileIconTheme } & Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
      size?: number;
    },
) {
  const { theme, size, ...rest } = props;
  const stroke = getStroke(theme);
  const accent = theme === "light" ? "#7F56D9" : "#B692F6";
  const { width, height } = SvgSize({ size });

  return (
    <svg width={width} height={height} fill="none" viewBox="0 0 40 40" aria-hidden="true" {...rest}>
      <path
        stroke={stroke}
        strokeWidth={1.5}
        d="M4.75 4A3.25 3.25 0 0 1 8 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 32 39.25H8A3.25 3.25 0 0 1 4.75 36z"
      />
      <path stroke={stroke} strokeWidth={1.5} d="M24 .5V8a4 4 0 0 0 4 4h7.5" />
      <path
        stroke={accent}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M25.25 30.75h.758c.728 0 1.092 0 1.293-.152a.75.75 0 0 0 .296-.553c.015-.252-.187-.555-.59-1.16l-2.259-3.387c-.333-.501-.5-.751-.71-.839a.75.75 0 0 0-.575 0c-.21.088-.378.338-.712.839l-.558.837m3.057 4.415-5.763-8.325c-.332-.479-.498-.718-.705-.802a.75.75 0 0 0-.564 0c-.207.084-.373.323-.705.802l-4.46 6.442c-.422.61-.633.915-.62 1.168a.75.75 0 0 0 .293.56c.201.155.572.155 1.314.155zm1.5-11.25a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0"
      />
    </svg>
  );
}

function AudioIcon(
  props: { theme: FileIconTheme } & Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
      size?: number;
    },
) {
  const { theme, size, ...rest } = props;
  const stroke = getStroke(theme);
  const accent = theme === "light" ? "#DD2590" : "#F670C7";
  const { width, height } = SvgSize({ size });

  return (
    <svg width={width} height={height} fill="none" viewBox="0 0 40 40" aria-hidden="true" {...rest}>
      <path
        stroke={stroke}
        strokeWidth={1.5}
        d="M4.75 4A3.25 3.25 0 0 1 8 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 32 39.25H8A3.25 3.25 0 0 1 4.75 36z"
      />
      <path stroke={stroke} strokeWidth={1.5} d="M24 .5V8a4 4 0 0 0 4 4h7.5" />
      <path
        stroke={accent}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M16.85 28.5v-8.733c0-.362 0-.542.066-.689a.75.75 0 0 1 .269-.317c.133-.089.312-.119.668-.178l6.6-1.1c.48-.08.72-.12.908-.05a.75.75 0 0 1 .39.33c.099.172.099.416.099.904V27m-9 1.5a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0m9-1.5a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0"
      />
    </svg>
  );
}

function VideoIcon(
  props: { theme: FileIconTheme } & Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
      size?: number;
    },
) {
  const { theme, size, ...rest } = props;
  const stroke = getStroke(theme);
  const accent = theme === "light" ? "#155EEF" : "#528BFF";
  const { width, height } = SvgSize({ size });

  return (
    <svg width={width} height={height} fill="none" viewBox="0 0 40 40" aria-hidden="true" {...rest}>
      <path
        stroke={stroke}
        strokeWidth={1.5}
        d="M4.75 4A3.25 3.25 0 0 1 8 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 32 39.25H8A3.25 3.25 0 0 1 4.75 36z"
      />
      <path stroke={stroke} strokeWidth={1.5} d="M24 .5V8a4 4 0 0 0 4 4h7.5" />
      <g clipPath="url(#video_svg__a)">
        <path
          stroke={accent}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12.5 24h15m-15-3.75h3.75m7.5 0h3.75m-15 7.5h3.75m7.5 0h3.75M16.25 31.5v-15m7.5 15v-15m-7.65 15h7.8c1.26 0 1.89 0 2.372-.245.423-.216.767-.56.983-.983.245-.482.245-1.112.245-2.372v-7.8c0-1.26 0-1.89-.245-2.372a2.25 2.25 0 0 0-.983-.983C25.79 16.5 25.16 16.5 23.9 16.5h-7.8c-1.26 0-1.89 0-2.372.245-.423.216-.767.56-.983.983-.245.482-.245 1.112-.245 2.372v7.8c0 1.26 0 1.89.245 2.372.216.423.56.767.984.983.48.245 1.11.245 2.371.245"
        />
      </g>
      <defs>
        <clipPath id="video_svg__a">
          <path fill="#fff" d="M11 15h18v18H11z" />
        </clipPath>
      </defs>
    </svg>
  );
}

function PdfIcon(
  props: { theme: FileIconTheme } & Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
      size?: number;
    },
) {
  const { theme, size, ...rest } = props;
  const stroke = getStroke(theme);
  const fill = theme === "light" ? "#D92D20" : "#F97066";
  const { width, height } = SvgSize({ size });

  return (
    <svg width={width} height={height} fill="none" viewBox="0 0 40 40" aria-hidden="true" {...rest}>
      <path
        stroke={stroke}
        strokeWidth={1.5}
        d="M7.75 4A3.25 3.25 0 0 1 11 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 35 39.25H11A3.25 3.25 0 0 1 7.75 36z"
      />
      <path stroke={stroke} strokeWidth={1.5} d="M27 .5V8a4 4 0 0 0 4 4h7.5" />
      <rect width={26} height={16} x={1} y={18} fill={fill} rx={2} />
      <path
        fill="#fff"
        d="M4.832 30v-7.273h2.87q.826 0 1.41.316.582.314.887.87.31.555.31 1.279t-.313 1.278q-.313.555-.906.863-.59.309-1.427.309h-1.83V26.41h1.581q.444 0 .732-.153.29-.156.433-.43.145-.276.145-.635 0-.363-.145-.632a.97.97 0 0 0-.433-.423q-.291-.153-.74-.153H6.37V30zm9.053 0h-2.578v-7.273h2.6q1.095 0 1.889.437.791.433 1.218 1.246.43.814.43 1.947 0 1.136-.43 1.953a2.95 2.95 0 0 1-1.226 1.253q-.795.437-1.903.437m-1.04-1.317h.976q.682 0 1.147-.242.47-.244.703-.756.238-.516.238-1.328 0-.807-.238-1.318a1.54 1.54 0 0 0-.7-.753q-.465-.24-1.146-.241h-.98zM18.582 30v-7.273h4.816v1.268H20.12v1.733h2.958v1.268H20.12V30z"
      />
    </svg>
  );
}

function ZipIcon(
  props: { theme: FileIconTheme } & Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
      size?: number;
    },
) {
  const { theme, size, ...rest } = props;
  const stroke = getStroke(theme);
  const { width, height } = SvgSize({ size });

  return (
    <svg width={width} height={height} fill="none" viewBox="0 0 40 40" aria-hidden="true" {...rest}>
      <path
        stroke={stroke}
        strokeWidth={1.5}
        d="M7.75 4A3.25 3.25 0 0 1 11 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 35 39.25H11A3.25 3.25 0 0 1 7.75 36z"
      />
      <path stroke={stroke} strokeWidth={1.5} d="M27 .5V8a4 4 0 0 0 4 4h7.5" />
      <rect width={22} height={16} x={1} y={18} fill="#344054" rx={2} />
      <path
        fill="#fff"
        d="M4.58 30v-.913l3.63-5.092H4.573v-1.268h5.568v.913L6.51 28.732h3.64V30zm8.286-7.273V30h-1.538v-7.273zM14.131 30v-7.273h2.87q.826 0 1.41.316.58.314.887.87.309.555.309 1.279t-.312 1.278-.906.863q-.59.309-1.428.309h-1.828V26.41h1.58q.444 0 .731-.153.292-.156.434-.43.145-.276.145-.635 0-.363-.145-.632a.97.97 0 0 0-.434-.423q-.291-.153-.738-.153h-1.037V30z"
      />
    </svg>
  );
}

function renderIcon(
  type: FileTypeIconName,
  theme: FileIconTheme,
  svgProps: Omit<SVGProps<SVGSVGElement>, "width" | "height"> & { size?: number },
) {
  switch (type) {
    case "image":
      return <ImageIcon theme={theme} {...svgProps} />;
    case "audio":
      return <AudioIcon theme={theme} {...svgProps} />;
    case "video":
      return <VideoIcon theme={theme} {...svgProps} />;
    case "pdf":
      return <PdfIcon theme={theme} {...svgProps} />;
    case "zip":
      return <ZipIcon theme={theme} {...svgProps} />;
    case "document":
      return <DocumentIcon theme={theme} {...svgProps} />;
    case "empty":
    default:
      return <EmptyIcon theme={theme} {...svgProps} />;
  }
}

export function FileTypeIcon(props: FileTypeIconProps) {
  const { filename, mimeType, type, theme = "auto", size, className, ...restSvgProps } = props;

  const computedType = useMemo<FileTypeIconName>(() => {
    if (type) return type;
    const byMime = detectTypeFromMime(mimeType);
    if (byMime) return byMime;
    const byExt = detectTypeFromExtension(normalizeExtension(filename));
    if (byExt) return byExt;
    return "empty";
  }, [filename, mimeType, type]);

  const sharedSvgProps = {
    ...restSvgProps,
    size,
    className: "block",
  };

  if (theme === "light" || theme === "dark") {
    return (
      <span className={cn("inline-block", className)}>
        {renderIcon(computedType, theme, sharedSvgProps)}
      </span>
    );
  }

  return (
    <span className={cn("inline-block", className)}>
      <span className="dark:hidden">{renderIcon(computedType, "light", sharedSvgProps)}</span>
      <span className="not-dark:hidden">{renderIcon(computedType, "dark", sharedSvgProps)}</span>
    </span>
  );
}
