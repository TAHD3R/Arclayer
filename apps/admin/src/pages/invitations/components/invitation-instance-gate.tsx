import { Button } from "@arclayer/ui/button";
import { Card } from "@arclayer/ui/card";

type InvitationInstanceGateProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  reason?: string | null;
};

export function InvitationInstanceGate(props: InvitationInstanceGateProps) {
  return (
    <Card className="grid gap-4 p-8">
      <div className="grid gap-2">
        <h1 className="text-title2 text-label-primary">{props.title}</h1>
        <p className="max-w-[40ch] text-body text-label-secondary">{props.description}</p>
      </div>
      {props.reason ? (
        <div className="rounded-2xl border border-border/80 bg-muted/40 px-4 py-3">
          <div className="font-mono text-footnote text-label-primary">{props.reason}</div>
        </div>
      ) : null}
      <div>
        <Button onClick={props.onAction}>{props.actionLabel}</Button>
      </div>
    </Card>
  );
}
