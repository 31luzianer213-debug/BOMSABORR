import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type SubmittedOrderItem = {
  name: string;
  size: string;
  qty: number;
  unitPrice: number;
  notes: string;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();

function pizzaSizeKey(size: string) {
  const first = normalize(size.split(/[—-]/)[0] ?? "");
  if (first.startsWith("pequena") || first === "p") return "price_p" as const;
  if (first.startsWith("media") || first === "m") return "price_m" as const;
  if (first.startsWith("grande") || first === "g") return "price_g" as const;
  if (first.startsWith("familia") || first === "f") return "price_f" as const;
  return null;
}

function pizzaFlavors(name: string) {
  return name
    .replace(/^pizza\s+/i, "")
    .split(/\s*\/\s*/)
    .map((part) => part.replace(/^½\s*/, "").trim())
    .filter(Boolean);
}

/** Recalcula cada item usando somente o cardápio ativo; nunca confia no preço do navegador ou da IA. */
export async function validateAndPriceItems(
  supabase: SupabaseClient<Database>,
  submitted: SubmittedOrderItem[],
) {
  const [{ data: products, error: productError }, { data: categories, error: categoryError }] = await Promise.all([
    supabase.from("products").select("id, name, price, category_id, active").eq("active", true),
    supabase.from("categories").select("id, name, kind, price_p, price_m, price_g, price_f, active").eq("active", true),
  ]);
  if (productError || categoryError) throw new Error("Não foi possível validar o cardápio agora.");

  const activeProducts = products ?? [];
  const activeCategories = categories ?? [];
  const priced = submitted.map((item) => {
    if (item.name.toLocaleLowerCase("pt-BR").startsWith("pizza ")) {
      const categoryName = item.size.split("—")[1]?.trim();
      const category = activeCategories.find(
        (candidate) => candidate.kind === "pizza" && (!categoryName || normalize(candidate.name) === normalize(categoryName)),
      );
      const sizeKey = pizzaSizeKey(item.size);
      if (!category || !sizeKey) throw new Error(`Tamanho ou categoria inválida para ${item.name}.`);
      const flavors = pizzaFlavors(item.name);
      const validFlavors = flavors.every((flavor) =>
        activeProducts.some(
          (product) => product.category_id === category.id && normalize(product.name) === normalize(flavor),
        ),
      );
      if (!flavors.length || !validFlavors) throw new Error(`Sabor indisponível: ${item.name}.`);
      const price = Number(category[sizeKey] ?? 0);
      if (!(price > 0)) throw new Error(`Tamanho indisponível para ${item.name}.`);
      return { ...item, unitPrice: price };
    }

    const product = activeProducts.find((candidate) => normalize(candidate.name) === normalize(item.name));
    if (!product || product.price == null) throw new Error(`Item indisponível: ${item.name}.`);
    return { ...item, unitPrice: Number(product.price) };
  });

  return {
    items: priced,
    itemsJson: priced as unknown as Json,
    subtotal: priced.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
  };
}