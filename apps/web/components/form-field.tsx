import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

export function FormField({
  label,
  error,
  hint,
  required,
  children
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-ink">
      <span>
        {label}
        {required && (
          <span className="ml-1 text-red-500" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="text-xs font-normal text-ink/50">{hint}</span>
      )}
      {error && (
        <span
          className="flex items-center gap-1.5 text-xs font-medium text-red-600"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}
    </label>
  );
}
