import type { ReactNode } from "react";

import { DefaultPage, type DefaultPageProps } from "@/components/common/default-page";

type WorkspaceContentShellProps = DefaultPageProps & {
  hero?: ReactNode;
};

export function WorkspaceContentShell({
  hero,
  children,
  contentClassName,
  ...pageProps
}: WorkspaceContentShellProps) {
  return (
    <DefaultPage
      {...pageProps}
      contentClassName={["grid gap-4", contentClassName].filter(Boolean).join(" ")}
    >
      {hero ? (
        <section className="rounded-xl border border-border/60 bg-muted/20 p-4">{hero}</section>
      ) : null}
      {children}
    </DefaultPage>
  );
}
