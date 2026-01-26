import { message } from "antd";
import { type PropsWithChildren, useLayoutEffect } from "react";

import { setMessageApi } from "@/core/services/notifications";

export function AntdMessageProvider({ children }: PropsWithChildren) {
  const [messageApi, contextHolder] = message.useMessage();

  useLayoutEffect(() => {
    setMessageApi(messageApi);
    return () => setMessageApi(null);
  }, [messageApi]);

  return (
    <>
      {contextHolder}
      {children}
    </>
  );
}
