import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("notes")
      .select("category, body, updated_at");
    if (error) throw new Error(error.message);
    return { notes: data ?? [] };
  });

export const saveNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ category: z.string().min(1).max(120), body: z.string().max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notes")
      .upsert(
        { user_id: userId, category: data.category, body: data.body },
        { onConflict: "user_id,category" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyProductItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("my_product_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const saveMyProductItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        category: z.string().min(1).max(120),
        title: z.string().min(1).max(280),
        status: z.string().min(1).max(60),
        target_date: z.string().optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { error } = await supabase
        .from("my_product_items")
        .update({
          category: data.category,
          title: data.title,
          status: data.status,
          target_date: data.target_date,
          notes: data.notes,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("my_product_items").insert({
        user_id: userId,
        category: data.category,
        title: data.title,
        status: data.status,
        target_date: data.target_date,
        notes: data.notes,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteMyProductItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("my_product_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });