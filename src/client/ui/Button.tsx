import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "icon";

interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
}

interface TextButtonProps extends ButtonBaseProps {
  variant?: Exclude<ButtonVariant, "icon">;
}

interface IconButtonVariantProps extends Omit<ButtonBaseProps, "aria-label"> {
  "aria-label": string;
  variant: "icon";
}

export type ButtonProps = TextButtonProps | IconButtonVariantProps;

const LEGACY_VARIANT_CLASSES: Partial<Record<ButtonVariant, string>> = {
  primary: "primary",
  danger: "danger",
};

export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  loadingLabel = "处理中",
  type = "button",
  variant = "secondary",
  ...buttonProps
}: ButtonProps) {
  const classes = [
    "btn",
    "ui-button",
    `ui-button--${variant}`,
    LEGACY_VARIANT_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      type={type}
    >
      <span
        aria-hidden={loading || undefined}
        className={`ui-button__label${loading ? " ui-button__label--loading" : ""}`}
      >
        {children}
      </span>
      <span
        aria-hidden={loading ? undefined : true}
        className={`ui-button__loading${loading ? "" : " ui-button__loading--hidden"}`}
        role={loading ? "status" : undefined}
      >
        <LoaderCircle aria-hidden="true" size={20} />
        <span>{loadingLabel}</span>
      </span>
    </button>
  );
}
