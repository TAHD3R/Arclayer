import { cn } from "@/lib/utils";

export type ProviderIcon = Readonly<{
  lightUrl: string;
  darkUrl: string;
}>;

export type ProviderIconDraft = Readonly<{
  lightUrl: string | null;
  darkUrl: string | null;
}>;

type Props = Readonly<{
  icon: ProviderIcon;
  alt?: string;
  className?: string;
}>;

export function ProviderIconImage({ icon, alt = "", className }: Props) {
  return (
    <>
      <img alt={alt} className={cn("object-contain dark:hidden", className)} src={icon.lightUrl} />
      <img
        alt={alt}
        className={cn("hidden object-contain dark:block", className)}
        src={icon.darkUrl}
      />
    </>
  );
}
