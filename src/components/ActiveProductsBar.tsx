import { useActiveProductIds, MAX_ACTIVE } from "@/lib/products";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";

export function ActiveProductsBar() {
  const { activeIds, products, toggle } = useActiveProductIds();

  if (products.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/60 px-6 py-2.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Products
      </span>
      {products.map((p) => {
        const on = activeIds.has(p.id);
        return (
          <button
            key={p.id}
            onClick={async () => {
              const r = await toggle(p.id, !on);
              if (!r.ok)
                toast.error(`Max ${MAX_ACTIVE} active products. Remove one first.`);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              on
                ? "border-transparent text-foreground"
                : "border-border bg-transparent text-muted-foreground hover:text-foreground"
            }`}
            style={on ? { backgroundColor: `color-mix(in oklab, ${p.color} 22%, transparent)` } : undefined}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
            {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-60" />}
          </button>
        );
      })}
      <span className="ml-auto text-[10px] text-muted-foreground/70">
        {activeIds.size}/{MAX_ACTIVE} active
      </span>
    </div>
  );
}