import { type PropsWithChildren } from "react";

import { AntdProvider } from "@/core/providers/AntdProvider";
import { QueryProvider } from "@/core/providers/QueryProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AntdProvider>
      <QueryProvider>{children}</QueryProvider>
    </AntdProvider>
  );
}
