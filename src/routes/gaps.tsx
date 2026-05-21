import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReleases } from "@/lib/releases";
import { CATEGORIES } from "@/lib/categories";
import { useAuth } from "@/lib/auth-context";
import { listNotes, saveNote } from "@/lib/user.functions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/gaps")({
  component: GapsPage,
});

function GapsPage() {
  const { data } = useReleases();
  const { user } = useAuth();

  const summary = useMemo(() => {
    const out = CATEGORIES.map((c) => {
      const items = (data ?? []).filter((r) => r.category === c);
      const g = items.filter((r) => r.source === "google").length;
      const m = items.filter((r) => r.source === "microsoft").length;
      const verdict =
        g === 0 && m > 0
          ? "Microsoft only"
          : m === 0 && g > 0
            ? "Google only"
            : g === 0 && m === 0
              ? "Neither"
              : "Both";
      return { c, g, m, verdict };
    });
    return out;
  }, [data]);

  const fetchNotes = useServerFn(listNotes);
  const notesQ = useQuery({
    queryKey: ["notes"],
    queryFn: () => fetchNotes(),
    enabled: !!user,
  });
  const noteMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of notesQ.data?.notes ?? []) m[n.category] = n.body;
    return m;
  }, [notesQ.data]);

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Gap analysis</h1>
        <p className="text-xs text-muted-foreground">
          Where Google and Microsoft are investing — and your private notes per category.
        </p>
      </header>
      <div className="p-4">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Google</th>
              <th className="px-3 py-2">Microsoft</th>
              <th className="px-3 py-2">Verdict</th>
              <th className="px-3 py-2">Your take {user ? "" : "(sign in)"}</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.c} className="border-b border-border align-top">
                <td className="px-3 py-3 text-[13px] font-medium">{s.c}</td>
                <td className="px-3 py-3 tabular-nums">{s.g}</td>
                <td className="px-3 py-3 tabular-nums">{s.m}</td>
                <td className="px-3 py-3 text-muted-foreground">{s.verdict}</td>
                <td className="px-3 py-3">
                  <NoteCell category={s.c} initial={noteMap[s.c] ?? ""} disabled={!user} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NoteCell({
  category,
  initial,
  disabled,
}: {
  category: string;
  initial: string;
  disabled: boolean;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const save = useServerFn(saveNote);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => save({ data: { category, body: value } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  if (disabled)
    return <span className="text-[11px] text-muted-foreground/60">Sign in to add notes</span>;
  return (
    <div className="space-y-1.5">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your take…"
        className="min-h-[60px] text-xs"
      />
      {value !== initial && (
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
        >
          Save
        </Button>
      )}
    </div>
  );
}