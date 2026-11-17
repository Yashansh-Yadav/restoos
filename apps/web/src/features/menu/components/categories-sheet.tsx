"use client";

import { categoryInputSchema, type MenuCategory } from "@restoos/shared";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as api from "../api";
import { useRefreshMenu } from "../hooks";

// Categories (M2-T1): add, rename (+ Hindi), reorder with up/down buttons (accessible, no
// drag needed), hide/show. Categories are never deleted — old orders reference their items.

export function CategoriesSheet({
  outletId,
  categories,
  onClose,
}: {
  outletId: string;
  categories: MenuCategory[];
  onClose: () => void;
}) {
  const uid = useId();
  const refresh = useRefreshMenu(outletId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newNameHi, setNewNameHi] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; nameHi: string } | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError && err.status < 500
          ? err.message
          : "Couldn't save. Check your connection and try again.",
      );
      return false;
    } finally {
      setBusy(null);
    }
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    const parsed = categoryInputSchema.safeParse({ name: newName, nameHi: newNameHi });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the name");
      document.getElementById(`${uid}-new`)?.focus();
      return;
    }
    if (await run("add", () => api.createCategory(outletId, parsed.data))) {
      setNewName("");
      setNewNameHi("");
    }
  }

  const move = (index: number, by: -1 | 1) => {
    const ids = categories.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    void run(`move-${moved}`, () => api.reorderCategories(outletId, ids));
  };

  return (
    <SheetContent title="Categories" description="The order here is the order on the menu.">
      <div className="flex flex-col gap-6 pt-2">
        {categories.length > 0 ? (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {categories.map((c, i) =>
              editing?.id === c.id ? (
                <li key={c.id} className="flex flex-col gap-3 p-3">
                  <Label htmlFor={`${uid}-edit`}>Name</Label>
                  <Input
                    id={`${uid}-edit`}
                    name="name"
                    autoComplete="off"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                  <Label htmlFor={`${uid}-edit-hi`}>
                    Hindi Name <span className="font-normal">(optional)</span>
                  </Label>
                  <Input
                    id={`${uid}-edit-hi`}
                    name="nameHi"
                    lang="hi"
                    autoComplete="off"
                    value={editing.nameHi}
                    onChange={(e) => setEditing({ ...editing, nameHi: e.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => {
                        const parsed = categoryInputSchema.safeParse(editing);
                        if (!parsed.success) {
                          setError(parsed.error.issues[0]?.message ?? "Check the name");
                          return;
                        }
                        void run(`save-${c.id}`, () =>
                          api.updateCategory(outletId, c.id, {
                            name: parsed.data.name,
                            nameHi: parsed.data.nameHi ?? null,
                          }),
                        ).then((ok) => ok && setEditing(null));
                      }}
                    >
                      {busy === `save-${c.id}` ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={c.id} className="flex items-center gap-1 py-1 pr-1 pl-3">
                  <button
                    type="button"
                    className="flex min-h-touch min-w-0 flex-1 flex-col justify-center rounded-sm text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => setEditing({ id: c.id, name: c.name, nameHi: c.nameHi ?? "" })}
                    aria-label={`Rename ${c.name}`}
                  >
                    <span
                      className={cn(
                        "truncate text-base font-semibold",
                        !c.isActive && "text-muted-foreground",
                      )}
                    >
                      {c.name}
                    </span>
                    {c.nameHi || !c.isActive ? (
                      <span className="truncate text-sm text-muted-foreground" lang="hi">
                        {[c.nameHi, c.isActive ? null : "Hidden"].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === 0 || busy !== null}
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${c.name} up`}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === categories.length - 1 || busy !== null}
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${c.name} down`}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(`hide-${c.id}`, () =>
                        api.updateCategory(outletId, c.id, { isActive: !c.isActive }),
                      )
                    }
                    aria-label={c.isActive ? `Hide ${c.name}` : `Show ${c.name}`}
                  >
                    {c.isActive ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                  </Button>
                </li>
              ),
            )}
          </ol>
        ) : null}

        <form className="flex flex-col gap-3" onSubmit={(e) => void add(e)} noValidate>
          <Label htmlFor={`${uid}-new`}>New Category</Label>
          <Input
            id={`${uid}-new`}
            name="newCategory"
            autoComplete="off"
            placeholder="e.g. Starters…"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
          />
          <Label htmlFor={`${uid}-new-hi`}>
            Hindi Name <span className="font-normal">(optional)</span>
          </Label>
          <Input
            id={`${uid}-new-hi`}
            name="newCategoryHi"
            lang="hi"
            autoComplete="off"
            placeholder="e.g. स्टार्टर…"
            value={newNameHi}
            onChange={(e) => setNewNameHi(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button type="submit" disabled={busy !== null}>
              {busy === "add" ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              {busy === "add" ? "Adding…" : "Add Category"}
            </Button>
          </div>
        </form>
      </div>
    </SheetContent>
  );
}
