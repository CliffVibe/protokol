import { cn } from "cn";

// Как shadcn/ui skeleton, но фон — наш токен --line (виден и на --bg, и на --surface).
// Пульсация гасится глобальным правилом prefers-reduced-motion в globals.css.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-line", className)}
      {...props}
    />
  );
}

export { Skeleton };
