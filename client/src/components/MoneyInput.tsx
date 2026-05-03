import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumberVn, parseAmountInput } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const QUICK_ADDS: { label: string; value: number }[] = [
  { label: "+50K", value: 50_000 },
  { label: "+100K", value: 100_000 },
  { label: "+200K", value: 200_000 },
  { label: "+500K", value: 500_000 },
  { label: "+1M", value: 1_000_000 },
];

interface MoneyInputProps {
  /** Current numeric value (in VND). 0 displays as empty. */
  value: number;
  onChange: (next: number) => void;
  placeholder?: string;
  className?: string;
  inputId?: string;
  testId?: string;
  disabled?: boolean;
  /** Hide the quick-add chips when this input is for an edge case (e.g. read-only). */
  hideChips?: boolean;
}

/**
 * Money input with realtime VN-style grouping ("1.500.000") and quick-add chips
 * for common amounts. The value is held as a number in VND on the parent; this
 * component only renders the formatted string.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = "0",
  className,
  inputId,
  testId,
  disabled,
  hideChips,
}: MoneyInputProps) {
  const display = value > 0 ? formatNumberVn(value) : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseAmountInput(e.target.value));
  };

  const handleClear = () => onChange(0);

  return (
    <div className={cn("space-y-2", className)}>
      <Input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={display}
        onChange={handleChange}
        data-testid={testId}
        disabled={disabled}
        className="text-lg font-semibold tabular-nums"
      />
      {!hideChips && !disabled && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ADDS.map((q) => (
            <button
              key={q.value}
              type="button"
              data-testid={`chip-${q.label}`}
              onClick={() => onChange(value + q.value)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-secondary/60 text-foreground hover:bg-accent transition-colors"
            >
              {q.label}
            </button>
          ))}
          {value > 0 && (
            <button
              type="button"
              data-testid="chip-clear"
              onClick={handleClear}
              className="px-2.5 py-1 rounded-full text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Xóa
            </button>
          )}
        </div>
      )}
    </div>
  );
}
