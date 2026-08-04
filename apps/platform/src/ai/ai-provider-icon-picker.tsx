import { ImagePlus, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  ProviderIconImage,
  type ProviderIcon,
  type ProviderIconDraft,
} from "@/ai/ai-provider-icon";
import { Button } from "@/components/ui/button";

const BUILTIN_ICONS: ReadonlyArray<Readonly<{ name: string; icon: ProviderIcon }>> = [
  {
    name: "OpenAI",
    icon: {
      lightUrl: "/provider-icons/openai.svg",
      darkUrl: "/provider-icons/openai-dark.svg",
    },
  },
  {
    name: "Anthropic",
    icon: {
      lightUrl: "/provider-icons/anthropic.svg",
      darkUrl: "/provider-icons/anthropic-dark.svg",
    },
  },
  {
    name: "DeepSeek",
    icon: {
      lightUrl: "/provider-icons/deepseek.svg",
      darkUrl: "/provider-icons/deepseek.svg",
    },
  },
  {
    name: "Zhipu",
    icon: {
      lightUrl: "/provider-icons/zhipu.svg",
      darkUrl: "/provider-icons/zhipu.svg",
    },
  },
  {
    name: "Kimi",
    icon: {
      lightUrl: "/provider-icons/kimi.svg",
      darkUrl: "/provider-icons/kimi.svg",
    },
  },
];
const MAX_ICON_BYTES = 512 * 1024;

type IconVariant = keyof ProviderIconDraft;
type Props = Readonly<{
  value: ProviderIconDraft;
  onChange: (value: ProviderIconDraft) => void;
}>;

export function AiProviderIconPicker({ value, onChange }: Props) {
  const { t } = useTranslation("ai");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadVariant = useRef<IconVariant>("lightUrl");
  const [error, setError] = useState<string | null>(null);

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_ICON_BYTES) {
      setError(t("PROVIDER_ICON_UPLOAD_ERROR"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError(t("PROVIDER_ICON_UPLOAD_ERROR"));
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setError(null);
      onChange({ ...value, [uploadVariant.current]: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const chooseUpload = (variant: IconVariant) => {
    uploadVariant.current = variant;
    inputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {BUILTIN_ICONS.map(({ name, icon }) => {
          const selected = value.lightUrl === icon.lightUrl && value.darkUrl === icon.darkUrl;
          return (
            <button
              aria-label={t("USE_PROVIDER_ICON", { provider: name })}
              className={`flex size-12 items-center justify-center rounded-md border bg-background p-2 transition-colors hover:bg-accent ${selected ? "ring-2 ring-primary" : ""}`}
              key={name}
              onClick={() => {
                setError(null);
                onChange(icon);
              }}
              type="button"
            >
              <ProviderIconImage className="size-7" icon={icon} />
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{t("PROVIDER_ICON_THEME_HELP")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["lightUrl", "darkUrl"] as const).map((variant) => {
          const current = value[variant];
          const labelKey = variant === "lightUrl" ? "PROVIDER_ICON_LIGHT" : "PROVIDER_ICON_DARK";
          return (
            <div className="space-y-3 rounded-md border p-3" key={variant}>
              <p className="text-sm font-medium">{t(labelKey)}</p>
              <div className="flex min-h-16 items-center justify-center rounded-md bg-muted/40 p-3">
                {current ? (
                  <img alt="" className="size-10 object-contain" src={current} />
                ) : (
                  <span className="text-xs text-muted-foreground">{t("NO_ICON_SELECTED")}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => chooseUpload(variant)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ImagePlus aria-hidden="true" />
                  {t("UPLOAD_CUSTOM_ICON")}
                </Button>
                {current ? (
                  <Button
                    onClick={() => onChange({ ...value, [variant]: null })}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" />
                    {t("CLEAR_ICON")}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <input
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={upload}
        ref={inputRef}
        type="file"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
