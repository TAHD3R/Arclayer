import type { CSSProperties, ReactNode } from "react";

type StoryPageProps = Readonly<{
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  heroActions?: ReactNode;
}>;

type StorySectionProps = Readonly<{
  title: string;
  description?: ReactNode;
  children: ReactNode;
  kicker?: string;
}>;

type StoryLinkItemProps = Readonly<{
  title: string;
  description: ReactNode;
  hrefLabel?: string;
}>;

type StoryMetricProps = Readonly<{
  label: string;
  value: string;
  description?: ReactNode;
}>;

type TokenSwatchProps = Readonly<{
  label: string;
  token: string;
  usage: string;
  valueStyle: CSSProperties;
}>;

export function StoryPage({ eyebrow, title, description, children, heroActions }: StoryPageProps) {
  return (
    <div className="bg-background text-foreground relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-primary/8 absolute left-[8%] top-24 size-32 rounded-full blur-3xl" />
        <div className="bg-muted absolute right-[10%] top-56 size-44 rounded-full blur-3xl" />
        <div className="border-border/70 absolute bottom-24 left-[18%] size-16 rounded-full border-8" />
        <div className="border-primary/60 absolute right-[16%] top-32 size-20 rounded-[2rem] border-[6px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-20 px-8 pb-24 pt-12 md:px-12">
        <section className="mx-auto flex min-h-[52vh] w-full max-w-4xl flex-col items-center justify-center gap-8 text-center">
          <div className="text-caption text-label-secondary">{eyebrow}</div>
          <div className="max-w-4xl text-[clamp(3.2rem,7vw,5.8rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-balance">
            {title}
          </div>
          <div className="text-callout text-label-secondary max-w-3xl leading-8 text-balance">
            {description}
          </div>
          {heroActions ? (
            <div className="flex flex-wrap items-center justify-center gap-3">{heroActions}</div>
          ) : null}
        </section>

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-18">{children}</div>
      </div>
    </div>
  );
}

export function StorySection({ title, description, children, kicker }: StorySectionProps) {
  return (
    <section className="flex flex-col gap-8">
      <div className="max-w-3xl space-y-3">
        {kicker ? <div className="text-caption text-label-secondary">{kicker}</div> : null}
        <h2 className="text-title2 tracking-[-0.03em] text-balance">{title}</h2>
        {description ? (
          <div className="text-body text-label-secondary leading-8">{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StoryLinkItem({ title, description, hrefLabel = "Open" }: StoryLinkItemProps) {
  return (
    <article className="border-border/70 grid gap-3 border-b py-5 last:border-b-0">
      <div className="text-headline text-label-primary">{title}</div>
      <div className="text-footnote text-label-secondary leading-7">{description}</div>
      <div className="text-callout text-label-primary">{hrefLabel}</div>
    </article>
  );
}

export function StoryMetric({ label, value, description }: StoryMetricProps) {
  return (
    <div className="border-border/70 grid gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="text-caption text-label-secondary">{label}</div>
      <div className="text-title3 tracking-[-0.03em] text-balance">{value}</div>
      {description ? (
        <div className="text-footnote text-label-secondary leading-7">{description}</div>
      ) : null}
    </div>
  );
}

export function StoryNote({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-muted/70 rounded-2xl px-5 py-4 text-footnote leading-7 text-label-secondary">
      {children}
    </div>
  );
}

export function InlineCode({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <code className="bg-muted text-label-primary rounded-md px-1.5 py-0.5 text-[0.85em]">
      {children}
    </code>
  );
}

export function TokenSwatch({ label, token, usage, valueStyle }: TokenSwatchProps) {
  return (
    <div className="border-border/70 grid gap-4 border-b py-5 last:border-b-0">
      <div className="flex items-center gap-4">
        <div className="border-border h-12 w-16 shrink-0 rounded-xl border" style={valueStyle} />
        <div className="min-w-0 space-y-1">
          <div className="text-headline text-label-primary">{label}</div>
          <div className="text-footnote text-label-secondary leading-7">{usage}</div>
        </div>
      </div>
      <div className="text-caption text-label-secondary">
        <InlineCode>{token}</InlineCode>
      </div>
    </div>
  );
}
