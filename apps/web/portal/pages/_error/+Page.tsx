export { Page };

type ErrorPageProps = {
  is404?: boolean;
  abortStatusCode?: number;
  abortReason?: unknown;
};

function Page(props: ErrorPageProps) {
  const status = props.is404 ? 404 : (props.abortStatusCode ?? 500);
  const desc =
    status === 403
      ? "Forbidden."
      : status === 404
        ? "Page not found."
        : status === 500
          ? "Internal Server Error."
          : "Request failed.";

  const errorText =
    props.abortReason instanceof Error ? props.abortReason.message : props.abortReason;
  const isDev = import.meta.env.DEV;

  return (
    <div className="portal-error">
      <h1>{String(status)}</h1>
      <p>{desc}</p>
      {isDev && errorText ? <pre>{String(errorText)}</pre> : null}
    </div>
  );
}
