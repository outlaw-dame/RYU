import React from "react";
import type { IconWeight } from "@phosphor-icons/react";
import type { AppIconName, AppIconState } from "./iconTypes";
import { iconMap } from "./iconMap";

export interface AppIconProps {
  name: AppIconName;
  state?: AppIconState;
  size?: number | string;
  color?: string;
  label?: string;
  decorative?: boolean;
  className?: string;
}

const stateToWeight: Record<AppIconState, IconWeight> = {
  default: "regular",
  subtle: "light",
  active: "fill",
  emphasis: "bold"
};

export function AppIcon({
  name,
  state = "default",
  size = 22,
  color = "currentColor",
  label,
  decorative,
  className
}: AppIconProps) {
  const Icon = iconMap[name];

  if (!Icon) {
    console.warn(`AppIcon: Icon "${name}" not found in mapping.`);
    return null;
  }

  const isDecorative = decorative ?? !label;

  return (
    <Icon
      size={size}
      weight={stateToWeight[state]}
      color={color}
      className={className}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={!isDecorative ? label : undefined}
      role={!isDecorative ? "img" : undefined}
    />
  );
}

export const MemoAppIcon = React.memo(AppIcon);
