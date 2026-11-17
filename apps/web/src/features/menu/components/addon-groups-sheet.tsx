"use client";

import { addOnGroupInputSchema, formatINR, parseRupees, type AddOnGroup } from "@restoos/shared";
import { ChevronRight, Loader2, Plus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import * as api from "../api";
import { useRefreshMenu } from "../hooks";

// Add-on groups (M2-T1): e.g. "Extras" — pick 0 to 2 of cheese / butter / mint chutney.

type Row = { key: string; name: string; price: string };

const rupees = (paise: number) => (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);

export function AddOnGroupsSheet({
  outletId,
  groups,
  onClose,
}: {
  outletId: string;
  groups: AddOnGroup[];
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<AddOnGroup | "new" | null>(groups.length ? null : "new");

  if (editing) {
    return (
      <GroupForm
        key={editing === "new" ? "new" : editing.id}
        outletId={outletId}
        group={editing === "new" ? null : editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <SheetContent
      title="Add-ons"
      description="Extras customers can add to an item, like cheese or a dip."
    >
      <div className="flex flex-col gap-4 pt-2">
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setEditing(g)}
                className="flex min-h-touch-staff w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold">{g.name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {g.addOns.map((a) => a.name).join(", ")}
                  </span>
                </span>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" />
            Add Group
          </Button>
        </div>
      </div>
    </SheetContent>
  );
}

function GroupForm({
  outletId,
  group,
  onDone,
}: {
  outletId: string;
  group: AddOnGroup | null;
  onDone: () => void;
}) {
  const uid = useId();
  const refresh = useRefreshMenu(outletId);
  const [name, setName] = useState(group?.name ?? "");
  const [min, setMin] = useState(String(group?.minSelect ?? 0));
  const [max, setMax] = useState(String(group?.maxSelect ?? 1));
  const [rows, setRows] = useState<Row[]>(
    group?.addOns.map((a) => ({ key: a.id, name: a.name, price: rupees(a.price) })) ?? [
      { key: "first", name: "", price: "" },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let addOns: { name: string; price: number }[];
    try {
      addOns = rows
        .filter((r) => r.name.trim() !== "" || r.price.trim() !== "")
        .map((r) => ({ name: r.name, price: r.price.trim() === "" ? 0 : parseRupees(r.price) }));
    } catch {
      setError("Check the add-on prices — use numbers like 30 or 30.50 (leave blank for free).");
      return;
    }
    const parsed = addOnGroupInputSchema.safeParse({
      name,
      minSelect: Number(min),
      maxSelect: Number(max),
      addOns,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the group");
      return;
    }
    setBusy(true);
    try {
      if (group) await api.updateAddOnGroup(outletId, group.id, parsed.data);
      else await api.createAddOnGroup(outletId, parsed.data);
      await refresh();
      onDone();
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof ApiError && err.status < 500 ? err.message : "Couldn't save. Try again.",
      );
    }
  }

  return (
    <SheetContent title={group ? `Edit ${group.name}` : "New Add-on Group"}>
      <form className="flex flex-col gap-5 pt-2" onSubmit={(e) => void submit(e)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-name`}>Group Name</Label>
          <Input
            id={`${uid}-name`}
            name="name"
            autoComplete="off"
            placeholder="e.g. Extras…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-min`}>Pick at Least</Label>
            <Input
              id={`${uid}-min`}
              name="minSelect"
              inputMode="numeric"
              autoComplete="off"
              value={min}
              onChange={(e) => setMin(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className="tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-max`}>Pick at Most</Label>
            <Input
              id={`${uid}-max`}
              name="maxSelect"
              inputMode="numeric"
              autoComplete="off"
              value={max}
              onChange={(e) => setMax(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className="tabular-nums"
            />
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Add-ons</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2">
              <Input
                aria-label={`Add-on ${i + 1} name`}
                name={`addon-${i}-name`}
                autoComplete="off"
                placeholder="e.g. Extra cheese…"
                value={r.name}
                onChange={(e) =>
                  setRows((xs) =>
                    xs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)),
                  )
                }
                className="min-w-0 flex-1"
              />
              <Input
                aria-label={`Add-on ${i + 1} price in rupees (blank for free)`}
                name={`addon-${i}-price`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="₹ free…"
                value={r.price}
                onChange={(e) =>
                  setRows((xs) =>
                    xs.map((x) => (x.key === r.key ? { ...x, price: e.target.value } : x)),
                  )
                }
                className="w-24 tabular-nums"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                aria-label={`Remove add-on ${r.name || i + 1}`}
                onClick={() => setRows((xs) => xs.filter((x) => x.key !== r.key))}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() =>
              setRows((xs) => [...xs, { key: crypto.randomUUID(), name: "", price: "" }])
            }
          >
            <Plus aria-hidden="true" />
            Add Another
          </Button>
          {group ? (
            <p className="text-sm text-muted-foreground">
              Now:{" "}
              {group.addOns
                .map((a) => `${a.name} ${a.price ? formatINR(a.price, { paise: "auto" }) : "free"}`)
                .join(" · ")}
            </p>
          ) : null}
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onDone}>
            Back
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {busy ? "Saving…" : "Save Group"}
          </Button>
        </div>
      </form>

      {group ? (
        <div className="mt-6 border-t border-border pt-6">
          {confirmDelete ? (
            <div
              className="flex flex-col gap-3 rounded-md border border-destructive/40 p-4"
              role="group"
              aria-label="Confirm delete"
            >
              <p className="text-sm text-body">
                Items lose the &ldquo;{group.name}&rdquo; add-ons. Past orders keep what was chosen.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Keep Group
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    api
                      .deleteAddOnGroup(outletId, group.id)
                      .then(refresh)
                      .then(onDone, () => {
                        setBusy(false);
                        setError("Couldn't delete. Try again.");
                      });
                  }}
                >
                  Delete {group.name}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete Group
            </Button>
          )}
        </div>
      ) : null}
    </SheetContent>
  );
}
