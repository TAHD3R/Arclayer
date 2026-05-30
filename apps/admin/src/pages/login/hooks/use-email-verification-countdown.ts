import { useEffect, useState } from "react";

type EmailVerificationCountdownState = {
  email: string;
  retryAfter: number;
};

export function useEmailVerificationCountdown(
  verification?: EmailVerificationCountdownState | null,
) {
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (!verification) {
      setRetryAfter(0);
      return;
    }
    setRetryAfter(Math.max(0, verification.retryAfter));
  }, [verification]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfter((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  return { retryAfter, setRetryAfter };
}
