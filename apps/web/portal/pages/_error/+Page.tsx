export { Page };

type ErrorPageProps = {
  is404?: boolean;
  abortReason?: unknown;
};

// Vike-level fallback.
// Most route-level errors are handled by TanStack Router error components.
function Page(_props: ErrorPageProps) {
  return null;
}
