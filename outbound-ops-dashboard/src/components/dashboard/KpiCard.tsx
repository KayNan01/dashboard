import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "primary" | "warning" | "success" | "destructive";
}

const TONES: Record<NonNullable<Props["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/20 text-warning",
  success: "bg-success/15 text-success",
  destructive: "bg-destructive/15 text-destructive",
};

export function KpiCard({ label, value, hint, icon: Icon, tone = "primary" }: Props) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <span className={`flex size-8 items-center justify-center rounded-md ${TONES[tone]}`}>
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-3 truncate font-display text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
