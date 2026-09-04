export type CartItem = {
  id: string;
  name: string;
  size: string;
  qty: number;
  unitPrice: number;
  notes: string;
};

export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const SIZES = [
  { key: "p", label: "P", full: "Pequena" },
  { key: "m", label: "M", full: "Média" },
  { key: "g", label: "G", full: "Grande" },
  { key: "f", label: "F", full: "Família" },
] as const;

export type SizeKey = (typeof SIZES)[number]["key"];

export function cartTotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}
