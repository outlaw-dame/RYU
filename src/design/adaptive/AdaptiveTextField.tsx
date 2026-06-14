import React, { forwardRef } from "react";

export interface AdaptiveTextFieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label?: string;
  textarea?: boolean;
  isDomainOrHandle?: boolean;
}

export const AdaptiveTextField = forwardRef<HTMLInputElement | HTMLTextAreaElement, AdaptiveTextFieldProps>(
  (
    {
      label,
      textarea = false,
      isDomainOrHandle = false,
      className = "",
      ...rest
    },
    ref
  ) => {
    const defaultKeyboardProps = isDomainOrHandle
      ? {
          autoCapitalize: "none" as const,
          autoCorrect: "off",
          spellCheck: false,
          enterKeyHint: "done" as const
        }
      : {
          autoCapitalize: "sentences" as const,
          autoCorrect: "on",
          spellCheck: true,
          enterKeyHint: "done" as const
        };

    const uniqueId = React.useId();
    const id = rest.id || uniqueId;

    const finalProps = {
      id,
      ...defaultKeyboardProps,
      ...rest
    };

    const inputClasses = `adaptive-input ${className}`;

    return (
      <div className="adaptive-field-container">
        {label && <label htmlFor={id} className="adaptive-field-label">{label}</label>}
        {textarea ? (
          <textarea
            ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
            className={inputClasses}
            {...(finalProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.ForwardedRef<HTMLInputElement>}
            className={inputClasses}
            {...(finalProps as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
      </div>
    );
  }
);

AdaptiveTextField.displayName = "AdaptiveTextField";
