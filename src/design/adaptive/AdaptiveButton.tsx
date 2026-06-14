import React from "react";
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
  const f7Props: any = {
    type,
    disabled,
    onClick,
    "aria-label": ariaLabel
  };

  if (variant === "primary") {
    f7Props.fill = true;
  } else if (variant === "destructive") {
    f7Props.color = "red";
    f7Props.fill = true;
  } else if (variant === "plain") {
    f7Props.link = true;
  }

  return (
    <Button {...f7Props} className={className}>
      {children}
    </Button>
  );
}
