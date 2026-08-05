import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";

export type AvatarUploadCompletionNoticeProps = {
  description: string;
  actionLabel: string;
  pending: boolean;
  onContinue: () => void;
  className?: string;
};

export function AvatarUploadCompletionNotice(props: AvatarUploadCompletionNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3",
        props.className,
      )}
    >
      <p className="text-footnote text-label-secondary">{props.description}</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 justify-self-start"
        loading={props.pending}
        disabled={props.pending}
        onClick={props.onContinue}
      >
        {props.actionLabel}
      </Button>
    </div>
  );
}
