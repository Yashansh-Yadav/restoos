"use client";

import {
  DEFAULT_GST_RATE_BPS,
  DEFAULT_HSN_SAC,
  GST_RATES_BPS,
  MAX_VARIANTS,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_TYPES,
  itemInputSchema,
  parseRupees,
  type DietType,
  type MenuItem,
  type OwnerMenu,
} from "@restoos/shared";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as api from "../api";
import { useRefreshMenu } from "../hooks";
import { DietMarker, dietLabel } from "./diet-marker";

// Add / edit one menu item (M2-T1). Money is typed in rupees and sent as paise (rule 1).
// English for now; owner screens move to the i18n helper when it lands.

const DIETS: DietType[] = ["VEG", "NON_VEG", "EGG"];
const rupees = (paise: number) => (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);

type Size = { key: string; name: string; price: string };
type Errors = Record<string, string | undefined>;

/** "120", "₹ 120.50" → paise, or null when it isn't a price. */
function toPaise(value: string): number | null {
  try {
    return parseRupees(value);
  } catch {
    return null;
  }
}

export function ItemSheet({
  outletId,
  menu,
  item,
  categoryId,
  onClose,
}: {
  outletId: string;
  menu: OwnerMenu;
  /** null = add a new item. */
  item: MenuItem | null;
  /** Category to preselect when adding. */
  categoryId: string | undefined;
  onClose: () => void;
}) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;

  const [name, setName] = useState(item?.name ?? "");
  const [nameHi, setNameHi] = useState(item?.nameHi ?? "");
  const [category, setCategory] = useState(
    item?.categoryId ?? categoryId ?? menu.categories[0]?.id ?? "",
  );
  const [diet, setDiet] = useState<DietType>(item?.dietType ?? "VEG");
  const [price, setPrice] = useState(item ? rupees(item.basePrice) : "");
  const [rate, setRate] = useState<number>(item?.taxRateBps ?? DEFAULT_GST_RATE_BPS);
  const [hsn, setHsn] = useState(item?.hsnSac ?? DEFAULT_HSN_SAC);
  const [code, setCode] = useState(item?.code ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [sizes, setSizes] = useState<Size[]>(
    item?.variants.map((v) => ({ key: v.id, name: v.name, price: rupees(v.price) })) ?? [],
  );
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set(item?.addOnGroupIds ?? []));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Set once a new item is saved, so a retry after a failed photo upload updates it. */
  const [savedId, setSavedId] = useState<string | null>(item?.id ?? null);

  const refresh = useRefreshMenu(outletId);

  // Object URLs for the chosen photo are freed when replaced or closed.
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const shownImage = preview ?? (removePhoto ? null : (item?.imageUrl ?? null));

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!(MENU_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setErrors((e) => ({ ...e, photo: "Choose a JPG, PNG or WebP photo." }));
      return;
    }
    if (file.size > MENU_IMAGE_MAX_BYTES) {
      setErrors((e) => ({ ...e, photo: "Photos can be up to 5 MB. Try a smaller one." }));
      return;
    }
    setErrors((e) => ({ ...e, photo: undefined }));
    setRemovePhoto(false);
    setPhoto(file);
  }

  function buildInput() {
    const next: Errors = {};
    const sizeRows = sizes.map((s) => ({ name: s.name, price: toPaise(s.price) }));
    sizeRows.forEach((s, i) => {
      if (s.price === null) next[`size-${i}`] = "Enter a price, e.g. 120";
    });
    // With sizes, the item's price is its smallest size (what the menu shows as "from").
    const basePrice =
      sizeRows.length > 0
        ? Math.min(...sizeRows.map((s) => s.price ?? Number.MAX_SAFE_INTEGER))
        : toPaise(price);
    if (sizeRows.length === 0 && basePrice === null) next.basePrice = "Enter a price, e.g. 220";
    const parsed = itemInputSchema.safeParse({
      categoryId: category,
      name,
      nameHi,
      description,
      code,
      hsnSac: hsn,
      dietType: diet,
      basePrice: basePrice ?? 0,
      taxRateBps: rate,
      isActive: item?.isActive ?? true,
      variants: sizeRows.map((s) => ({ name: s.name, price: s.price ?? 0 })),
      addOnGroupIds: [...groupIds],
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [head, index] = issue.path;
        const key =
          head === "variants"
            ? typeof index === "number"
              ? `size-${index}`
              : "sizes"
            : String(head);
        next[key] ??= issue.message;
      }
    }
    return { input: parsed.success ? parsed.data : null, next };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { input, next } = buildInput();
    setErrors(next);
    if (!input || Object.values(next).some(Boolean)) {
      const first = Object.keys(next).find((k) => next[k]);
      if (first) document.getElementById(f(first))?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = savedId
        ? await api.updateItem(outletId, savedId, input)
        : await api.createItem(outletId, input);
      setSavedId(saved.id);
      try {
        if (photo) await api.uploadItemImage(outletId, saved.id, photo);
        else if (removePhoto && item?.imageUrl) await api.removeItemImage(outletId, saved.id);
      } catch (err) {
        // The item is saved; only the photo failed. Say so — retrying now updates, not duplicates.
        await refresh();
        setBusy(false);
        setErrors((x) => ({
          ...x,
          photo:
            err instanceof ApiError && err.status < 500
              ? `${err.message} The item itself is saved.`
              : "The item is saved, but the photo didn't upload. Try again.",
        }));
        return;
      }
      await refresh();
      onClose();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.code === "CODE_TAKEN") {
        setErrors((x) => ({ ...x, code: err.message }));
        document.getElementById(f("code"))?.focus();
      } else {
        setFormError(
          err instanceof ApiError && err.status < 500
            ? err.message
            : "Couldn't save. Check your connection and try again.",
        );
      }
    }
  }

  async function setHidden(hidden: boolean) {
    if (!item) return;
    setBusy(true);
    try {
      await api.updateItem(outletId, item.id, { isActive: !hidden });
      await refresh();
      onClose();
    } catch {
      setBusy(false);
      setFormError("Couldn't save. Check your connection and try again.");
    }
  }

  const err = (key: string) =>
    errors[key] ? (
      <p id={`${f(key)}-error`} className="text-sm font-medium text-destructive">
        {errors[key]}
      </p>
    ) : null;
  const aria = (key: string) =>
    errors[key] ? { "aria-invalid": true as const, "aria-describedby": `${f(key)}-error` } : {};
  const clear = (key: string) => errors[key] && setErrors((x) => ({ ...x, [key]: undefined }));

  return (
    <SheetContent title={item ? `Edit ${item.name}` : "Add Item"}>
      <form className="flex flex-col gap-5 pt-2" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field id={f("name")} label="Name" error={err("name")}>
          <Input
            id={f("name")}
            name="name"
            autoComplete="off"
            placeholder="e.g. Paneer Tikka…"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
            {...aria("name")}
          />
        </Field>
        <Field id={f("nameHi")} label="Hindi Name" optional error={err("nameHi")}>
          <Input
            id={f("nameHi")}
            name="nameHi"
            lang="hi"
            autoComplete="off"
            placeholder="e.g. पनीर टिक्का…"
            value={nameHi}
            onChange={(e) => setNameHi(e.target.value)}
            {...aria("nameHi")}
          />
        </Field>

        <Field id={f("categoryId")} label="Category" error={err("categoryId")}>
          <NativeSelect
            id={f("categoryId")}
            name="categoryId"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              clear("categoryId");
            }}
            {...aria("categoryId")}
          >
            {menu.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? "" : " (hidden)"}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Type</legend>
          <div className="grid grid-cols-3 gap-2">
            {DIETS.map((d) => (
              <Chip key={d} name={f("diet")} checked={diet === d} onChange={() => setDiet(d)}>
                <DietMarker diet={d} decorative />
                {dietLabel(d)}
              </Chip>
            ))}
          </div>
        </fieldset>

        {sizes.length === 0 ? (
          <Field id={f("basePrice")} label="Price (₹)" error={err("basePrice")}>
            <Input
              id={f("basePrice")}
              name="price"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 220…"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                clear("basePrice");
              }}
              className="w-40 tabular-nums"
              {...aria("basePrice")}
            />
          </Field>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">
            Sizes <span className="font-normal">(optional, e.g. Half / Full)</span>
          </legend>
          {sizes.map((s, i) => (
            <div key={s.key} className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Input
                  aria-label={`Size ${i + 1} name`}
                  name={`size-${i}-name`}
                  autoComplete="off"
                  placeholder="e.g. Half…"
                  value={s.name}
                  onChange={(e) =>
                    setSizes((xs) =>
                      xs.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div className="flex w-28 flex-col gap-1">
                <Input
                  id={f(`size-${i}`)}
                  aria-label={`Size ${i + 1} price in rupees`}
                  name={`size-${i}-price`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="₹…"
                  value={s.price}
                  onChange={(e) => {
                    setSizes((xs) =>
                      xs.map((x) => (x.key === s.key ? { ...x, price: e.target.value } : x)),
                    );
                    clear(`size-${i}`);
                  }}
                  className="tabular-nums"
                  {...aria(`size-${i}`)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove size ${s.name || i + 1}`}
                onClick={() => setSizes((xs) => xs.filter((x) => x.key !== s.key))}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
          {sizes.map((_, i) => err(`size-${i}`))}
          {err("sizes")}
          {sizes.length < MAX_VARIANTS ? (
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() =>
                setSizes((xs) => [
                  ...xs,
                  {
                    key: crypto.randomUUID(),
                    name: xs.length === 0 ? "Half" : xs.length === 1 ? "Full" : "",
                    price: xs.length === 0 ? price : "",
                  },
                ])
              }
            >
              <Plus aria-hidden="true" />
              Add Size
            </Button>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">GST</legend>
          <div className="grid grid-cols-4 gap-2">
            {GST_RATES_BPS.map((r) => (
              <Chip key={r} name={f("rate")} checked={rate === r} onChange={() => setRate(r)}>
                <span className="tabular-nums">{r / 100}%</span>
              </Chip>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Restaurant food is usually 5%.</p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field id={f("hsnSac")} label="HSN / SAC" error={err("hsnSac")}>
            <Input
              id={f("hsnSac")}
              name="hsnSac"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={hsn}
              onChange={(e) => {
                setHsn(e.target.value.replace(/\D/g, "").slice(0, 8));
                clear("hsnSac");
              }}
              className="tabular-nums"
              {...aria("hsnSac")}
            />
          </Field>
          <Field id={f("code")} label="Item Code" optional error={err("code")}>
            <Input
              id={f("code")}
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. PT1…"
              value={code}
              onChange={(e) => {
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 10),
                );
                clear("code");
              }}
              className="uppercase"
              {...aria("code")}
            />
          </Field>
        </div>

        <Field id={f("description")} label="Description" optional error={err("description")}>
          <Textarea
            id={f("description")}
            name="description"
            rows={2}
            placeholder="e.g. Cottage cheese cubes, charcoal-grilled…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            {...aria("description")}
          />
        </Field>

        {menu.addOnGroups.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Add-ons</legend>
            {menu.addOnGroups.map((g) => (
              <label
                key={g.id}
                className="flex min-h-touch cursor-pointer items-center gap-3 rounded-md border border-border px-4 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
              >
                <input
                  type="checkbox"
                  checked={groupIds.has(g.id)}
                  onChange={(e) =>
                    setGroupIds((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(g.id);
                      else next.delete(g.id);
                      return next;
                    })
                  }
                  className="size-5 shrink-0 accent-foreground"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-semibold">{g.name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {g.addOns.map((a) => a.name).join(", ")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">
            Photo <span className="font-normal">(optional)</span>
          </legend>
          <div className="flex items-center gap-4">
            <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
              {shownImage ? (
                <Image
                  src={shownImage}
                  alt={`Photo of ${name || "the item"}`}
                  width={96}
                  height={96}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : (
                <ImagePlus className="size-7 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-sm border border-foreground px-4 text-sm font-medium hover:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
                <input
                  id={f("photo")}
                  type="file"
                  accept={MENU_IMAGE_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => choosePhoto(e.target.files?.[0])}
                />
                {shownImage ? "Replace Photo" : "Choose Photo"}
              </label>
              {shownImage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhoto(null);
                    setRemovePhoto(true);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Remove Photo
                </Button>
              ) : null}
            </div>
          </div>
          {err("photo") ?? (
            <p className="text-sm text-muted-foreground">JPG, PNG or WebP up to 5 MB.</p>
          )}
        </fieldset>

        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={busy || menu.categories.length === 0}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {busy ? "Saving…" : item ? "Save Changes" : "Add Item"}
        </Button>
      </form>

      {item ? (
        <div className="mt-6 border-t border-border pt-6">
          {!item.isActive ? (
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void setHidden(false)}
            >
              Show on Menu Again
            </Button>
          ) : confirmHide ? (
            <div
              className="flex flex-col gap-3 rounded-md border border-border p-4"
              role="group"
              aria-label="Confirm hiding"
            >
              <p className="text-sm text-body">
                {item.name} disappears from the menu and the order screen. Past orders and bills
                keep it.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setConfirmHide(false)}>
                  Keep on Menu
                </Button>
                <Button disabled={busy} onClick={() => void setHidden(true)}>
                  Hide {item.name}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" className="w-full" onClick={() => setConfirmHide(true)}>
              Hide from Menu
            </Button>
          )}
        </div>
      ) : null}
    </SheetContent>
  );
}

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal"> (optional)</span> : null}
      </Label>
      {children}
      {error}
    </div>
  );
}

/** A radio styled as a compact chip (diet, GST rate). */
function Chip({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-sm font-semibold transition-[border-color,background-color] duration-150 motion-reduce:transition-none",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
        checked ? "border-2 border-foreground bg-muted" : "border-input hover:bg-muted",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}
