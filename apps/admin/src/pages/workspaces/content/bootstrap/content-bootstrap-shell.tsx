import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

export function ContentBootstrapShell(props: {
  eyebrow: string;
  title: string;
  description: string;
  sideTitle: string;
  sideDescription: string;
  principles: string[];
  progress: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(36,99,235,0.12),_transparent_36%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(255,255,255,1))] text-foreground">
      <div className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(135deg,rgba(14,116,144,0.12),rgba(59,130,246,0.06),transparent)]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_22rem] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-label-secondary">
                {props.eyebrow}
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-[2.8rem]">
                  {props.title}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-label-secondary sm:text-[1.05rem]">
                  {props.description}
                </p>
              </div>
            </div>
            {props.progress}
          </div>

          <aside className="rounded-[28px] border border-border/65 bg-white/82 p-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="space-y-3">
              <h2 className="text-title3 text-foreground">{props.sideTitle}</h2>
              <p className="text-sm leading-6 text-label-secondary">{props.sideDescription}</p>
            </div>
            <div className="mt-5 space-y-3">
              {props.principles.map((principle) => (
                <div
                  key={principle}
                  className={cn(
                    "rounded-2xl border border-border/70 bg-background/75 px-3 py-3 text-sm leading-6 text-foreground/88",
                  )}
                >
                  {principle}
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="min-h-0 flex-1">{props.children}</section>

        <div className="sticky bottom-0 z-10 rounded-[28px] border border-border/70 bg-white/88 px-5 py-4 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.36)] backdrop-blur">
          {props.footer}
        </div>
      </div>
    </div>
  );
}
