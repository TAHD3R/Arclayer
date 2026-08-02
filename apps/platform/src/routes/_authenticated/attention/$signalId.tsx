import { createFileRoute } from "@tanstack/react-router";

import { SignalDetailSheet } from "@/operations/signal-detail-sheet";

export const Route = createFileRoute("/_authenticated/attention/$signalId")({
  component: function OperationalSignalDetailRoute() {
    const navigate = Route.useNavigate();
    const { signalId } = Route.useParams();
    return (
      <SignalDetailSheet
        onClose={() => void navigate({ to: "/attention" })}
        onQueueRefresh={() => undefined}
        showDestination={false}
        signalId={signalId}
      />
    );
  },
});
