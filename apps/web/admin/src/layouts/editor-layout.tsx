import { type PropsWithChildren, useEffect } from "react";

export function EditorLayout({ children }: PropsWithChildren) {
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-background text-label-primary">
      {children}
    </div>
  );
}
