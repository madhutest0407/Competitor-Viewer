import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Search } from "lucide-react";
import { CATEGORIES, STATUSES } from "@/lib/categories";

export type FilterState = {
  statuses: Set<string>;
  categories: Set<string>;
  search: string;
};

export const defaultFilters: FilterState = {
  statuses: new Set(STATUSES),
  categories: new Set(CATEGORIES),
  search: "",
};

export function Filters({
  value,
  onChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  function toggleSet(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/60 px-6 py-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search releases…"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          className="h-8 w-64 pl-7 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <Toggle
            key={s}
            size="sm"
            pressed={value.statuses.has(s)}
            onPressedChange={() =>
              onChange({ ...value, statuses: toggleSet(value.statuses, s) })
            }
            className="h-7 px-2 text-xs"
          >
            {s}
          </Toggle>
        ))}
      </div>
    </div>
  );
}