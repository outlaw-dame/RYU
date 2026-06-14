import React from "react";
import { AppIcon } from "../icons/AppIcon";

/**
 * AdaptiveSearchField Props
 */
export interface AdaptiveSearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  className?: string;
}

/**
 * A lightweight, platform-adaptive search field wrapper.
 * NOTE: This component is implemented as a lightweight, native React input wrapper (rather than
 * a Framework7 Searchbar component) to allow clean standard HTML prop forwarding, direct style control,
 * and full type safety without Framework7 list container limitations.
 */
export function AdaptiveSearchField({
  value,
  onChange,
  placeholder = "Search...",
  autoFocus = false,
  onClear,
  className = "",
  ...rest
}: AdaptiveSearchFieldProps) {
  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className={`adaptive-search-container ${className}`}>
      <div className="adaptive-search-icon-left">
        <AppIcon name="search" state="subtle" size={18} />
      </div>
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="adaptive-search-input"
        {...rest}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={handleClear}
          className="adaptive-search-clear-button"
          aria-label="Clear search"
        >
          <AppIcon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
