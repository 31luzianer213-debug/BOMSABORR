import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SIZES, brl, type CartItem, type SizeKey } from "@/lib/cart";
import type { Category, Product } from "@/lib/menu.functions";

type Props = {
  product: Product | null;
  category: Category | null;
  siblings: Product[];
  allowHalfHalf: boolean;
  onClose: () => void;
  onAdd: (item: Omit<CartItem, "id">) => void;
};

function priceFor(category: Category, size: SizeKey) {
  const value = category[`price_${size}` as const];
  return value === null ? 0 : Number(value);
}

export function PizzaDialog({
  product,
  category,
  siblings,
  allowHalfHalf,
  onClose,
  onAdd,
}: Props) {
  const [size, setSize] = useState<SizeKey>("m");
  const [mode, setMode] = useState<"one" | "two">("one");
  const [first, setFirst] = useState<string>("");
  const [second, setSecond] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);

  const availableSizes = useMemo(
    () => (category ? SIZES.filter((s) => priceFor(category, s.key) > 0) : []),
    [category],
  );

  if (!product || !category) return null;

  const firstProduct = siblings.find((item) => item.id === first) ?? product;
  const secondProduct = siblings.find((item) => item.id === second) ?? null;
  const unitPrice = priceFor(category, size);
  const sizeLabel = SIZES.find((s) => s.key === size)?.full ?? "";

  const reset = () => {
    setSize("m");
    setMode("one");
    setFirst("");
    setSecond("none");
    setNotes("");
    setQty(1);
  };


  return (
    <Dialog open onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] border-white/10 bg-popover shadow-soft">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">{product.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Escolha o tamanho da pizza
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{product.description}</p>

        <div className="space-y-2">
          <Label>Tamanho</Label>
          <div className="grid grid-cols-4 gap-2">
            {availableSizes.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSize(option.key)}
                className={`rounded-xl border px-2 py-3 text-center transition-colors ${
                  size === option.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-card-foreground"
                }`}
              >
                <span className="block font-display text-lg leading-none">{option.label}</span>
                <span className="block text-[10px] uppercase opacity-80">{option.full}</span>
                <span className="mt-1 block text-xs font-bold">
                  {brl(priceFor(category, option.key))}
                </span>
              </button>
            ))}
          </div>
        </div>

        {allowHalfHalf && (
          <div className="space-y-3">
            <Label>Sabores</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "one", label: "1 sabor" },
                  { key: "two", label: "2 sabores" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setMode(option.key);
                    if (option.key === "one") setSecond("none");
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    mode === option.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-card-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {mode === "two" ? "1º sabor (metade)" : "Sabor"}
              </Label>
              <Select value={first || product.id} onValueChange={setFirst}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {siblings.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "two" && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">2º sabor (metade)</Label>
                <Select value={second} onValueChange={setSecond}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o 2º sabor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Escolha o 2º sabor</SelectItem>
                    {siblings
                      .filter((item) => item.id !== firstProduct.id)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}


        <div className="space-y-2">
          <Label htmlFor="pizza-notes">Observações</Label>
          <Textarea
            id="pizza-notes"
            maxLength={200}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Sem cebola, borda simples..."
          />
        </div>

        <div className="flex items-center gap-3">
          <Label>Quantidade</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => setQty((value) => Math.max(1, value - 1))}
            >
              −
            </Button>
            <span className="w-8 text-center font-display text-lg">{qty}</span>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => setQty((value) => Math.min(30, value + 1))}
            >
              +
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={mode === "two" && !secondProduct}
            className="w-full font-display text-lg"
            onClick={() => {
              onAdd({
                name:
                  mode === "two" && secondProduct
                    ? `Pizza ½ ${firstProduct.name} / ½ ${secondProduct.name}`
                    : `Pizza ${firstProduct.name}`,
                size: `${sizeLabel} — ${category.name}`,
                qty,
                unitPrice,
                notes,
              });
              reset();
              onClose();
            }}
          >
            {mode === "two" && !secondProduct
              ? "Escolha o 2º sabor"
              : `Adicionar • ${brl(unitPrice * qty)}`}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
