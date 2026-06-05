import type { Release } from "@/lib/releases";
import { STATUS_COLORS, type Status } from "@/lib/categories";
import { useProducts } from "@/lib/products";

export function ReleaseCard({
  release,
  onClick,
}: {
  release: Release;
  onClick?: () => void;
}) {
  const { data: products } = useProducts();
  const product = products?.find((p) => p.id === release.source);
  const vendorVar = product?.color ?? "var(--vendor-default)";
  const vendorLabel = product?.name ?? release.source;
  const statusColor =
    STATUS_COLORS[(release.status as Status) ?? "Planned"] ?? "var(--status-planned)";
  return (
    <button
      onClick={onClick}
      className="group block w-full cursor-pointer rounded-md border border-border bg-card p-2.5 text-left transition-all hover:border-primary hover:shadow-md hover:scale-105"
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
        <span
          className="rounded px-1 py-px font-medium text-background"
          style={{ backgroundColor: vendorVar }}
        >
          {vendorLabel}
        </span>
        <span
          className="inline-flex items-center gap-1 text-muted-foreground"
          title={release.status ?? ""}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          {release.status}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
        {release.title}
      </div>
      {release.summary && (
        <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {release.summary}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{release.category ?? "Other"}</span>
        <span>{release.release_date ?? "—"}</span>
      </div>
    </button>
  );
}