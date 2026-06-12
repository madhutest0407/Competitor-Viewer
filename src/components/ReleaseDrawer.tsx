import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Release } from "@/lib/releases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export function ReleaseDrawer({
  release,
  onClose,
}: {
  release: Release | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!release} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {release && (
          <>
            <SheetHeader>
              <SheetTitle className="text-base leading-snug">{release.title}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
              {release.source && <Badge variant="outline">{release.source}</Badge>}
              {release.status && <Badge variant="outline">{release.status}</Badge>}
              {release.category && <Badge variant="outline">{release.category}</Badge>}
              {release.release_date && (
                <Badge variant="outline">Released {release.release_date}</Badge>
              )}
            </div>
            {release.summary && (
              <div className="mt-5 text-sm leading-relaxed text-muted-foreground">{release.summary}</div>
            )}
            {(release.audience?.length ?? 0) > 0 && (
              <div className="mt-5">
                <div className="text-xs font-medium text-muted-foreground">
                  Audience: {release.audience!.length} {release.audience!.length === 1 ? "group" : "groups"}
                </div>
              </div>
            )}
            {release.source_url && /^https?:\/\//i.test(release.source_url) && (
              <Button
                asChild
                size="sm"
                className="mt-6 w-full"
              >
                <a
                  href={release.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5"
                >
                  View full details <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}