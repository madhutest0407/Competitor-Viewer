import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Release } from "@/lib/releases";
import { Badge } from "@/components/ui/badge";
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
              <Badge variant="outline">{release.source}</Badge>
              <Badge variant="outline">{release.status}</Badge>
              <Badge variant="outline">{release.category}</Badge>
              {release.release_date && (
                <Badge variant="outline">Released {release.release_date}</Badge>
              )}
            </div>
            {release.summary && (
              <div className="mt-4 text-sm text-muted-foreground">{release.summary}</div>
            )}
            {release.description && release.description !== release.summary && (
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
                {release.description.slice(0, 4000)}
              </div>
            )}
            {(release.audience?.length ?? 0) > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-muted-foreground">Audience</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {release.audience!.map((a) => (
                    <Badge key={a} variant="secondary" className="text-[10px]">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {release.source_url && (
              <a
                href={release.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}