import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "bg-surface text-fg border-line",
          description: "text-muted",
        },
      }}
    />
  );
}
