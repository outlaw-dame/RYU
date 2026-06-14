import type { ComponentProps } from "react";
import { Button } from "framework7-react";

export interface AdaptiveButtonProps {
  variant?: "primary" | "secondary" | "plain" | "destructive";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  "aria-label"?: string;
  className?: string;
  children?: React.ReactNode;
}

export function AdaptiveButton({
  variant = "secondary",
  type = "button",
  disabled = false,
  onClick,
  "aria-label": ariaLabel,
  className = "",
  children
}: AdaptiveButtonProps) {
  const f7Props: ComponentProps<typeof Button> & { "aria-label"?: string; link?: boolean } = {
    type,
    disabled,
    onClick,
    "aria-label": ariaLabel,
    fill: variant === "primary" || variant === "destructive",
    color: variant === "destructive" ? "red" : undefined,
    link: variant === "plain"
  };

  return (
    <Button {...f7Props} className={className}>
      {children}
    </Button>
  );
}
