import { cn } from "@arclayer/lib/utils";

function Skeleton({
  className,
  "aria-hidden": ariaHidden = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden={ariaHidden}
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
