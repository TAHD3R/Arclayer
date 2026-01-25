import { message } from "antd";
import { type PropsWithChildren, useEffect } from "react";

import { setMessageApi } from "@/core/services/notifications";

export function AntdMessageProvider({ children }: PropsWithChildren) {
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
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
