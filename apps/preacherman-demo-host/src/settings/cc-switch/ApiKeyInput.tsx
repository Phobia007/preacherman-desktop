// Adapted from CC Switch's ApiKeyInput.tsx (MIT, Jason Young).
// See public/licenses/cc-switch.txt for source and license.
import { useState } from "react";

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  label: string;
  id: string;
  showLabel: string;
  hideLabel: string;
}

export default function ApiKeyInput({
  value, onChange, placeholder, disabled = false, label, id, showLabel, hideLabel,
}: ApiKeyInputProps) {
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="ai-provider-settings__field">
      <label htmlFor={id}>{label}</label>
      <div className="ai-provider-settings__secret">
        <input
          type={showKey ? "text" : "password"}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          data-secret="true"
        />
        {!disabled && value && (
          <button type="button" onClick={() => setShowKey(!showKey)}
            aria-label={showKey ? hideLabel : showLabel} aria-pressed={showKey}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {showKey && <path d="m3 3 18 18" />}
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
