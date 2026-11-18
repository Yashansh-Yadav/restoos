"use client";

import {
  formatINR,
  selectionError,
  unitPriceOf,
  type PadAddOnGroup,
  type PadItem,
} from "@restoos/shared";
import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Options for one dish (M5-T1): size, add-ons (within each group's limits), a note for the
// kitchen, and how many. Opened by tapping a dish that needs a choice, a long-press, or
// "Options" on a cart line.

export type Draft = {
  itemId: string;
  variantId: string | null;
  addOnIds: string[];
  quantity: number;
  note?: string | undefined;
};

const choice =
  "flex min-h-touch-staff cursor-pointer items-center justify-between gap-3 rounded-md border px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

export function OptionsSheet({
  item,
  groups,
  initial,
  editing,
  onDone,
}: {
  item: PadItem;
  groups: PadAddOnGroup[];
  initial: Draft;
  editing: boolean;
  onDone: (draft: Draft) => void;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<Draft>({
    ...initial,
    variantId: initial.variantId ?? item.variants[0]?.id ?? null,
  });
  const [tried, setTried] = useState(false);
  const mine = groups.filter((g) => item.addOnGroupIds.includes(g.id));
  const problem = selectionError(item, groups, draft);
  const unit = unitPriceOf(item, groups, draft);

  const toggleAddOn = (group: PadAddOnGroup, id: string) =>
    setDraft((d) => {
      if (d.addOnIds.includes(id)) return { ...d, addOnIds: d.addOnIds.filter((x) => x !== id) };
      const inGroup = group.addOns.map((a) => a.id);
      let next = [...d.addOnIds, id];
      // A one-choice group behaves like radio buttons.
      if (group.maxSelect === 1) next = [...d.addOnIds.filter((x) => !inGroup.includes(x)), id];
      return { ...d, addOnIds: next };
    });

  return (
    <SheetContent title={item.name}>
      <form
        className="flex flex-col gap-6 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!problem) onDone(draft);
        }}
        noValidate
      >
        {item.variants.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-muted-foreground">Size</legend>
            {item.variants.map((v) => (
              <label
                key={v.id}
                className={cn(
                  choice,
                  draft.variantId === v.id ? "border-2 border-foreground bg-muted" : "border-input",
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={`${uid}-size`}
                    checked={draft.variantId === v.id}
                    onChange={() => setDraft((d) => ({ ...d, variantId: v.id }))}
                    className="size-5 accent-foreground"
                  />
                  <span className="text-base font-semibold">{v.name}</span>
                </span>
                <span className="text-base tabular-nums">{formatINR(v.price)}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {mine.map((g) => (
          <fieldset key={g.id} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-muted-foreground">
              {g.name}{" "}
              <span className="font-normal">
                {g.minSelect > 0
                  ? g.minSelect === g.maxSelect
                    ? `(choose ${g.minSelect})`
                    : `(choose ${g.minSelect}–${g.maxSelect})`
                  : `(optional, up to ${g.maxSelect})`}
              </span>
            </legend>
            {g.addOns.map((a) => {
              const on = draft.addOnIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cn(
                    choice,
                    on ? "border-2 border-foreground bg-muted" : "border-input",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type={g.maxSelect === 1 ? "radio" : "checkbox"}
                      name={`${uid}-${g.id}`}
                      checked={on}
                      onChange={() => toggleAddOn(g, a.id)}
                      className="size-5 accent-foreground"
                    />
                    <span className="text-base">{a.name}</span>
                  </span>
                  <span className="text-base text-muted-foreground tabular-nums">
                    {a.price > 0 ? `+${formatINR(a.price)}` : "Free"}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-note`}>Note for the Kitchen</Label>
          <Input
            id={`${uid}-note`}
            name="note"
            autoComplete="off"
            maxLength={120}
            placeholder="e.g. less spicy, no onion…"
            value={draft.note ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground" id={`${uid}-qty`}>
            How Many
          </span>
          <div role="group" aria-labelledby={`${uid}-qty`} className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="One less"
              disabled={draft.quantity <= 1}
              onClick={() => setDraft((d) => ({ ...d, quantity: Math.max(1, d.quantity - 1) }))}
            >
              <Minus aria-hidden="true" />
            </Button>
            <span className="w-8 text-center text-xl font-bold tabular-nums" aria-live="polite">
              {draft.quantity}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="One more"
              disabled={draft.quantity >= 99}
              onClick={() => setDraft((d) => ({ ...d, quantity: Math.min(99, d.quantity + 1) }))}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
        </div>

        {tried && problem ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {problem}
          </p>
        ) : null}
        <Button type="submit" size="staff">
          {editing ? "Update" : "Add"} · {formatINR(unit * draft.quantity)}
        </Button>
      </form>
    </SheetContent>
  );
}
