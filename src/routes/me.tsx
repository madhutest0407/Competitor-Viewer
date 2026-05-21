import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMyProductItem,
  listMyProductItems,
  saveMyProductItem,
} from "@/lib/user.functions";
import { CATEGORIES, STATUSES } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/me")({
  component: MyProductPage,
});

function MyProductPage() {
  const { user, loading } = useAuth();
  const fetchItems = useServerFn(listMyProductItems);
  const save = useServerFn(saveMyProductItem);
  const del = useServerFn(deleteMyProductItem);
  const qc = useQueryClient();

  const itemsQ = useQuery({
    queryKey: ["my-items"],
    queryFn: () => fetchItems(),
    enabled: !!user,
  });

  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string>(STATUSES[0]);
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          category,
          title,
          status,
          target_date: targetDate || null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Added");
      setTitle("");
      setNotes("");
      setTargetDate("");
      qc.invalidateQueries({ queryKey: ["my-items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-items"] }),
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!user) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Sign in to track your own product roadmap.
      </div>
    );
  }

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">My product</h1>
        <p className="text-xs text-muted-foreground">
          Private — only you can see these. Track your own roadmap against Google & Microsoft.
        </p>
      </header>
      <div className="grid gap-6 p-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Add item
          </div>
          <div className="space-y-2">
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
            <Textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px]"
            />
            <Button
              className="w-full"
              disabled={!title || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              Add
            </Button>
          </div>
        </div>
        <div>
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Target</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(itemsQ.data?.items ?? []).map((it) => (
                <tr key={it.id} className="border-b border-border align-top">
                  <td className="px-2 py-2 text-[13px] font-medium">
                    {it.title}
                    {it.notes && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{it.notes}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{it.category}</td>
                  <td className="px-2 py-2 text-muted-foreground">{it.status}</td>
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">
                    {it.target_date ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => delMut.mutate(it.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(itemsQ.data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}