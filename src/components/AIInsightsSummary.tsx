import { AlertTriangle, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface Insight {
  text: string;
  type: "threat" | "opportunity" | "trend";
}

interface AIInsightsSummaryProps {
  variant: "timeline" | "gaps" | "compare";
  insights?: Insight[];
  isLoading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
  canGenerate?: boolean;
}

export function AIInsightsSummary({
  variant,
  insights,
  isLoading,
  error,
  onGenerate,
  canGenerate = true,
}: AIInsightsSummaryProps) {
  const title =
    variant === "timeline"
      ? "Market Briefing"
      : variant === "compare"
        ? "Category Insights"
        : "Strategic Recommendations";
  const subtitle =
    variant === "timeline"
      ? "Key competitive themes this quarter"
      : variant === "compare"
        ? "Feature parity analysis across categories"
        : "Priorities based on competitor activity";

  if (isLoading) {
    return (
      <div className="mb-4 rounded-md border border-border bg-card p-4">
        <div className="mb-3 space-y-1">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-48 animate-pulse rounded bg-muted/50" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted/70" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="mb-1 text-sm font-semibold text-foreground">{title}</div>
        <p className="text-xs text-destructive">{error}</p>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    if (!onGenerate) return null;
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-dashed border-border bg-card/40 p-4">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="h-8 gap-1.5 text-xs"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate
        </Button>
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "threat":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "opportunity":
        return <Star className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />;
      case "trend":
        return <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="mb-4 rounded-md border border-border bg-card p-4">
      <div className="mb-3 space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {insights.map((insight, idx) => (
          <div key={idx} className="flex gap-3">
            <div className="mt-0.5 shrink-0">
              {getIcon(insight.type)}
            </div>
            <p className="text-sm text-foreground/90">{insight.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
