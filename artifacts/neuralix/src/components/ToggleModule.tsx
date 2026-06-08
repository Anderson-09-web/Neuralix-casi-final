import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ToggleModuleProps {
  title: string;
  description?: string;
  enabled: boolean;
  onToggle: (val: boolean) => void;
  children?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

export default function ToggleModule({ title, description, enabled, onToggle, children, badge, badgeColor = "bg-primary/20 text-primary" }: ToggleModuleProps) {
  return (
    <div className={cn("bg-card border rounded-xl p-5 transition-all", enabled ? "border-primary/30" : "border-card-border")}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">{title}</h3>
              {badge && <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", badgeColor)}>{badge}</span>}
            </div>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} data-testid={`toggle-${title.toLowerCase().replace(/\s+/g, "-")}`} />
      </div>
      {enabled && children && <div className="mt-4 pt-4 border-t border-border space-y-3">{children}</div>}
    </div>
  );
}
