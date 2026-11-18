"use client";

import {
  bulkTablesSchema,
  labelRange,
  sectionInputSchema,
  tableInputSchema,
  type FloorSection,
  type FloorTable,
} from "@restoos/shared";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import * as api from "../api";
import { floorError, useRefreshFloor } from "../hooks";

// Sheets for /owner/floor (M3-T1): sections, add tables (range or single), edit one table.

const SEAT_CHOICES = [2, 4, 6, 8];

function Seats({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (n: number) => void;
  name: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Seats</legend>
      <div className="flex flex-wrap gap-2">
        {SEAT_CHOICES.map((n) => (
          <label
            key={n}
            className={cn(
              "flex size-touch cursor-pointer items-center justify-center rounded-md border text-base font-semibold tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              value === n ? "border-2 border-foreground bg-muted" : "border-input hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            {n}
          </label>
        ))}
        <Input
          aria-label="Other number of seats"
          name={`${name}-other`}
          inputMode="numeric"
          autoComplete="off"
          value={SEAT_CHOICES.includes(value) ? "" : String(value)}
          placeholder="Other…"
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
            if (n > 0) onChange(n);
          }}
          className="w-24 tabular-nums"
        />
      </div>
    </fieldset>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

export function SectionsSheet({
  outletId,
  sections,
  onClose,
}: {
  outletId: string;
  sections: FloorSection[];
  onClose: () => void;
}) {
  const uid = useId();
  const refresh = useRefreshFloor(outletId);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (err) {
      setError(floorError(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    const parsed = sectionInputSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the name");
      document.getElementById(`${uid}-new`)?.focus();
      return;
    }
    if (await run("add", () => api.createSection(outletId, parsed.data.name))) setName("");
  }

  const move = (index: number, by: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    void run(`move-${moved}`, () => api.reorderSections(outletId, ids));
  };

  return (
    <SheetContent
      title="Sections"
      description="Areas of your restaurant, like Main Hall or Terrace."
    >
      <div className="flex flex-col gap-6 pt-2">
        {sections.length > 0 ? (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {sections.map((s, i) =>
              renaming?.id === s.id ? (
                <li key={s.id} className="flex flex-col gap-2 p-3">
                  <Label htmlFor={`${uid}-rename`}>Section Name</Label>
                  <Input
                    id={`${uid}-rename`}
                    name="name"
                    autoComplete="off"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(`rename-${s.id}`, () =>
                          api.renameSection(outletId, s.id, renaming.name),
                        ).then((ok) => ok && setRenaming(null))
                      }
                    >
                      {busy === `rename-${s.id}` ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={s.id} className="flex items-center gap-1 py-1 pr-1 pl-3">
                  <button
                    type="button"
                    className="flex min-h-touch min-w-0 flex-1 flex-col justify-center rounded-sm text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => setRenaming({ id: s.id, name: s.name })}
                    aria-label={`Rename ${s.name}`}
                  >
                    <span className="truncate text-base font-semibold">{s.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {s.tables.length} {s.tables.length === 1 ? "table" : "tables"}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === 0 || busy !== null}
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${s.name} up`}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === sections.length - 1 || busy !== null}
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${s.name} down`}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={s.tables.length > 0 || busy !== null}
                    title={s.tables.length > 0 ? "Move or remove its tables first" : undefined}
                    onClick={() =>
                      void run(`delete-${s.id}`, () => api.deleteSection(outletId, s.id))
                    }
                    aria-label={
                      s.tables.length > 0
                        ? `${s.name} has tables — can't delete`
                        : `Delete ${s.name}`
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ),
            )}
          </ol>
        ) : null}

        <form className="flex flex-col gap-3" onSubmit={(e) => void add(e)} noValidate>
          <Label htmlFor={`${uid}-new`}>New Section</Label>
          <Input
            id={`${uid}-new`}
            name="newSection"
            autoComplete="off"
            placeholder="e.g. Main Hall…"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
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
              {busy === "add" ? "Adding…" : "Add Section"}
            </Button>
          </div>
        </form>
      </div>
    </SheetContent>
  );
}

// ── Add tables ──────────────────────────────────────────────────────────────

export function AddTablesSheet({
  outletId,
  sections,
  sectionId,
  onClose,
}: {
  outletId: string;
  sections: FloorSection[];
  sectionId: string | undefined;
  onClose: () => void;
}) {
  const uid = useId();
  const refresh = useRefreshFloor(outletId);
  const [mode, setMode] = useState<"range" | "single">("range");
  const [section, setSection] = useState(sectionId ?? sections[0]?.id ?? "");
  const [prefix, setPrefix] = useState("T");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = new Set(sections.flatMap((s) => s.tables.map((t) => t.label)));
  const range = bulkTablesSchema.safeParse({
    sectionId: section,
    prefix,
    from,
    to: Number(to),
    seats,
  });
  const labels = range.success ? labelRange(range.data.prefix, range.data.from, range.data.to) : [];
  const clashes = labels.filter((l) => existing.has(l));
  const preview =
    labels.length === 0
      ? null
      : labels.length <= 4
        ? labels.join(", ")
        : `${labels.slice(0, 2).join(", ")} … ${labels.at(-1) ?? ""}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const one = tableInputSchema.safeParse({ sectionId: section, label, seats });
    const invalid =
      mode === "range"
        ? range.success
          ? null
          : (range.error.issues[0]?.message ?? "Check the range")
        : one.success
          ? null
          : (one.error.issues[0]?.message ?? "Check the table name");
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      if (mode === "range" && range.success) await api.bulkCreateTables(outletId, range.data);
      else if (one.success) await api.createTable(outletId, one.data);
      await refresh();
      onClose();
    } catch (err) {
      setBusy(false);
      setError(floorError(err));
    }
  }

  return (
    <SheetContent title="Add Tables">
      <form className="flex flex-col gap-5 pt-2" onSubmit={(e) => void submit(e)} noValidate>
        <div role="group" aria-label="How many" className="grid grid-cols-2 gap-2">
          {(
            [
              ["range", "Several (T1–T10)"],
              ["single", "One Table"],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={cn(
                "min-h-touch rounded-md border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                mode === key
                  ? "border-2 border-foreground bg-muted"
                  : "border-input hover:bg-muted",
              )}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-section`}>Section</Label>
          <NativeSelect
            id={`${uid}-section`}
            name="sectionId"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        {mode === "range" ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-prefix`}>Prefix</Label>
                <Input
                  id={`${uid}-prefix`}
                  name="prefix"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 5))}
                  className="uppercase"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-from`}>From</Label>
                <Input
                  id={`${uid}-from`}
                  name="from"
                  inputMode="numeric"
                  autoComplete="off"
                  value={from}
                  onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  className="tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-to`}>To</Label>
                <Input
                  id={`${uid}-to`}
                  name="to"
                  inputMode="numeric"
                  autoComplete="off"
                  value={to}
                  onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  className="tabular-nums"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {range.success && preview
                ? `Creates ${labels.length} ${labels.length === 1 ? "table" : "tables"}: ${preview}`
                : (range.error?.issues[0]?.message ?? "")}
            </p>
            {clashes.length > 0 ? (
              <p className="text-sm font-medium text-destructive">
                {clashes.join(", ")} already {clashes.length === 1 ? "exists" : "exist"}. Change the
                range or prefix.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-label`}>Table Name</Label>
            <Input
              id={`${uid}-label`}
              name="label"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. VIP-1…"
              value={label}
              onChange={(e) => setLabel(e.target.value.toUpperCase().slice(0, 8))}
              className="uppercase"
            />
          </div>
        )}

        <Seats value={seats} onChange={setSeats} name={`${uid}-seats`} />

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={busy || (mode === "range" && (!range.success || clashes.length > 0))}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {busy
            ? "Adding…"
            : mode === "range"
              ? `Add ${labels.length || ""} ${labels.length === 1 ? "Table" : "Tables"}`.replace(
                  "  ",
                  " ",
                )
              : "Add Table"}
        </Button>
      </form>
    </SheetContent>
  );
}

// ── Edit one table ──────────────────────────────────────────────────────────

export function TableSheet({
  outletId,
  sections,
  table,
  sectionId,
  onClose,
}: {
  outletId: string;
  sections: FloorSection[];
  table: FloorTable;
  sectionId: string;
  onClose: () => void;
}) {
  const uid = useId();
  const refresh = useRefreshFloor(outletId);
  const [label, setLabel] = useState(table.label);
  const [seats, setSeats] = useState(table.seats);
  const [section, setSection] = useState(sectionId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateTable(outletId, table.id, {
        ...(label !== table.label && { label }),
        ...(seats !== table.seats && { seats }),
        ...(section !== sectionId && { sectionId: section }),
      });
      await refresh();
      onClose();
    } catch (err) {
      setBusy(false);
      setError(floorError(err));
    }
  }

  return (
    <SheetContent title={`Table ${table.label}`}>
      <form className="flex flex-col gap-5 pt-2" onSubmit={(e) => void save(e)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-label`}>Table Name</Label>
          <Input
            id={`${uid}-label`}
            name="label"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={label}
            onChange={(e) => setLabel(e.target.value.toUpperCase().slice(0, 8))}
            className="uppercase"
          />
        </div>
        <Seats value={seats} onChange={setSeats} name={`${uid}-seats`} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-section`}>Section</Label>
          <NativeSelect
            id={`${uid}-section`}
            name="sectionId"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {busy ? "Saving…" : "Save Changes"}
        </Button>
      </form>

      <div className="mt-6 border-t border-border pt-6">
        {confirmDelete ? (
          <div
            className="flex flex-col gap-3 rounded-md border border-destructive/40 p-4"
            role="group"
            aria-label="Confirm delete"
          >
            <p className="text-sm text-body">
              Delete table {table.label}? Its QR code stops working. Tables with past orders
              can&apos;t be deleted — rename them instead.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Keep Table
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  api
                    .deleteTable(outletId, table.id)
                    .then(refresh)
                    .then(onClose, (err: unknown) => {
                      setBusy(false);
                      setConfirmDelete(false);
                      setError(floorError(err));
                    });
                }}
              >
                Delete {table.label}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Delete Table
          </Button>
        )}
      </div>
    </SheetContent>
  );
}
