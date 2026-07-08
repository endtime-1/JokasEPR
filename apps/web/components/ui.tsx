"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  CircleAlert,
  CircleCheckBig,
  Info,
  X,
  CircleX,
  type LucideIcon
} from "lucide-react";

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const badgeStyles: Record<BadgeVariant, string> = {
  default: "bg-brand/10 text-brand border-brand/20",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-line/60 text-ink/60 border-line"
};

export function Badge({
  variant = "default",
  children,
  className
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyles[variant]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

const statusVariants: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  ENABLED: "success",
  DISABLED: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  UNDER_REVIEW: "info",
  DRAFT: "neutral",
  COMPLETED: "success",
  CANCELLED: "danger",
  ARCHIVED: "neutral",
  PAID: "success",
  UNPAID: "danger",
  PARTIAL: "warning",
  OVERDUE: "danger",
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "danger",
  IN_STOCK: "success",
  LOW_STOCK: "warning",
  OUT_OF_STOCK: "danger",
  SYNCED: "success",
  DUPLICATE: "neutral",
  FAILED: "danger",
  CONFLICT: "warning",
  OPEN: "info",
  CLOSED: "neutral",
  INVOICED: "success"
};

export function StatusBadge({
  status,
  className
}: {
  status: string;
  className?: string;
}) {
  const variant = statusVariants[status.toUpperCase()] ?? "neutral";
  return (
    <Badge variant={variant} className={className}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({
  size = "sm",
  className
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "h-3 w-3 border",
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-8 w-8 border-[3px]"
  };
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${sizes[size]} ${className ?? ""}`}
    />
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-line/70 ${className ?? "h-4 w-full"}`}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="app-card space-y-3 p-4" aria-hidden>
      <Skeleton className="h-3.5 w-1/3" />
      <Skeleton className="h-7 w-2/3" />
      {lines > 2 && <Skeleton className="h-3 w-1/2" />}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="app-card overflow-hidden" aria-hidden>
      <div className="border-b border-line px-4 py-3">
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>
      <div className="divide-y divide-line/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className={`h-4 ${j === 0 ? "w-1/4" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-line bg-field">
          <Icon aria-hidden className="h-7 w-7 text-ink/35" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink/70">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink/45">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {}
});

const toastIcons: Record<ToastType, LucideIcon> = {
  success: CircleCheckBig,
  error: CircleX,
  info: Info,
  warning: CircleAlert
};

const toastStyles: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900"
};

const toastIconStyles: Record<ToastType, string> = {
  success: "text-emerald-600",
  error: "text-red-600",
  info: "text-blue-600",
  warning: "text-amber-600"
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: addToast,
      success: (m) => addToast(m, "success"),
      error: (m) => addToast(m, "error"),
      info: (m) => addToast(m, "info"),
      warning: (m) => addToast(m, "warning")
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = toastIcons[t.type];
          return (
            <div
              key={t.id}
              role="alert"
              className={`flex animate-toast-in items-start gap-3 rounded-xl border p-4 shadow-toast ${toastStyles[t.type]}`}
            >
              <Icon
                aria-hidden
                className={`mt-0.5 h-4 w-4 shrink-0 ${toastIconStyles[t.type]}`}
              />
              <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
              <button
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        ref={overlayRef}
        className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`animate-slide-up relative w-full ${widths[size]} rounded-xl border border-line bg-white shadow-modal`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 id="modal-title" className="text-base font-bold text-ink">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-8 w-8 place-items-center rounded-md text-ink/50 transition hover:bg-field hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "danger",
  loading = false
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm leading-relaxed text-ink/70">{message}</p>
      <div className="mt-5 flex justify-end gap-3">
        <button className="app-button-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button
          className={variant === "danger" ? "app-button-danger" : "app-button-primary"}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading && <Spinner size="xs" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

export function PageHeader({
  kicker,
  title,
  description,
  actions
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {kicker && <p className="app-kicker">{kicker}</p>}
        <h1
          className={`font-bold tracking-tight text-ink ${kicker ? "mt-1 text-2xl" : "text-2xl"}`}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
