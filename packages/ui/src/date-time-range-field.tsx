import { Input } from "./input";

type DateTimeRangeFieldProps = {
  startValue?: string;
  endValue?: string;
  onChange: (next: { startValue?: string; endValue?: string }) => void;
  startPlaceholder?: string;
  endPlaceholder?: string;
  startAriaLabel?: string;
  endAriaLabel?: string;
  disabled?: boolean;
};

type DateTimeFieldProps = {
  value?: string;
  onChange: (nextValue?: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
};

function formatLocalDateSegment(value: number) {
  return String(value).padStart(2, "0");
}

export function isoToDateTimeLocalValue(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = formatLocalDateSegment(date.getMonth() + 1);
  const day = formatLocalDateSegment(date.getDate());
  const hours = formatLocalDateSegment(date.getHours());
  const minutes = formatLocalDateSegment(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function dateTimeLocalValueToIso(value?: string): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function DateTimeField(props: DateTimeFieldProps) {
  return (
    <Input
      id={props.id}
      name={props.name}
      type="datetime-local"
      step={60}
      value={isoToDateTimeLocalValue(props.value)}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onChange={(event) => props.onChange(dateTimeLocalValueToIso(event.target.value))}
    />
  );
}

export function DateTimeRangeField(props: DateTimeRangeFieldProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Input
        type="datetime-local"
        step={60}
        value={isoToDateTimeLocalValue(props.startValue)}
        placeholder={props.startPlaceholder}
        aria-label={props.startAriaLabel}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange({
            startValue: dateTimeLocalValueToIso(event.target.value),
            endValue: props.endValue,
          });
        }}
      />
      <Input
        type="datetime-local"
        step={60}
        value={isoToDateTimeLocalValue(props.endValue)}
        placeholder={props.endPlaceholder}
        aria-label={props.endAriaLabel}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange({
            startValue: props.startValue,
            endValue: dateTimeLocalValueToIso(event.target.value),
          });
        }}
      />
    </div>
  );
}
