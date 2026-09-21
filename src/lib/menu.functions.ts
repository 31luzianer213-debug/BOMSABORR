import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isStoreOpenNow } from "@/lib/store-hours";

export type StoreSettings = Database["public"]["Tables"]["store_settings"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type DeliveryZone = Database["public"]["Tables"]["delivery_zones"]["Row"];

export function createPublicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getMenu = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();

  const [settings, categories, products, zones] = await Promise.all([
    supabase.from("store_settings").select("*").limit(1).maybeSingle(),
    supabase.from("categories").select("*").eq("active", true).order("sort_order"),
    supabase.from("products").select("*").eq("active", true).order("sort_order"),
    supabase.from("delivery_zones").select("*").eq("active", true).order("sort_order"),
  ]);

  if (settings.error) throw new Error(settings.error.message);
  if (categories.error) throw new Error(categories.error.message);
  if (products.error) throw new Error(products.error.message);
  if (zones.error) throw new Error(zones.error.message);

  const storeSettings = settings.data as StoreSettings | null;

  return {
    settings: storeSettings
      ? {
          ...storeSettings,
          is_open: isStoreOpenNow(storeSettings.is_open, storeSettings.opening_hours),
        }
      : null,
    categories: (categories.data ?? []) as Category[],
    products: (products.data ?? []) as Product[],
    zones: (zones.data ?? []) as DeliveryZone[],
  };
});
