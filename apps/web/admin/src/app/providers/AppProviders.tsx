import { type PropsWithChildren } from "react";

import { AntdProvider } from "@/app/providers/AntdProvider";
import { QueryProvider } from "@/app/providers/QueryProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AntdProvider>
      <QueryProvider>{children}</QueryProvider>
    </AntdProvider>
  );
}
