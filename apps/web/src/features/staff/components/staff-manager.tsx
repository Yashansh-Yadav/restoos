"use client";

import {
  createEmployeeSchema,
  formatIndianMobile,
  setPinSchema,
  suggestPin,
  updateEmployeeSchema,
  type Employee,
  type StaffList,
} from "@restoos/shared";
import { ChevronRight, Loader2, RefreshCw, UserPlus, Users } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCreateEmployee, useSetPin, useStaff, useUpdateEmployee } from "../hooks";

// /owner/staff (M1-T5): list → tap a row to edit; "Add Staff" opens the same sheet.
// English for now; owner screens move to the i18n helper when it lands.

type Role = Employee["role"];
const ROLES: { role: Role; label: string; description: string }[] = [
  { role: "MANAGER", label: "Manager", description: "Runs the floor: menu, tables, voids, staff." },
  { role: "CASHIER", label: "Cashier", description: "Bills, payments and reprints." },
  { role: "BUTLER", label: "Butler", description: "Takes orders and answers the bell." },
  { role: "KITCHEN", label: "Kitchen", description: "Sees KOTs and marks dishes ready." },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.role === r)?.label ?? r;

type Mode = { kind: "add" } | { kind: "edit"; employee: Employee } | null;

/** Stable ref callback: scrolls a just-opened panel into view (it can open below the fold). */
function revealOnMount(el: HTMLElement | null) {
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "STAFF_LIMIT_REACHED" || err.code === "FORBIDDEN") return err.message;
    if (err.status === 401) return "Your session has ended. Sign in again.";
    if (err.code === "NOT_FOUND") return "This person no longer exists. Close and refresh.";
  }
  return "Couldn't save. Check your connection and try again.";
}

export function StaffManager({ outletId, initial }: { outletId: string; initial: StaffList }) {
  const { data } = useStaff(outletId, initial);
  const [mode, setMode] = useState<Mode>(null);
  const { employees, limit } = data;
  const atLimit = limit.max !== null && limit.used >= limit.max;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {limit.max === null
              ? `${limit.used} active`
              : `${limit.used} of ${limit.max} active staff on your plan`}
          </p>
        </div>
        <Button onClick={() => setMode({ kind: "add" })} disabled={atLimit}>
          <UserPlus aria-hidden="true" />
          Add Staff
        </Button>
      </div>
      {atLimit ? (
        <p className="rounded-md bg-muted px-4 py-3 text-sm text-body">
          You&apos;ve reached your plan&apos;s staff limit. Deactivate someone to add a new person.
        </p>
      ) : null}

      {employees.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-semibold">No staff yet</p>
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">
            Add your manager, cashiers, butlers and kitchen team. Each gets a PIN to sign in on
            restaurant devices.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {employees.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setMode({ kind: "edit", employee: e })}
                className="flex min-h-touch-staff w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                aria-label={`Edit ${e.name}, ${roleLabel(e.role)}${e.isActive ? "" : ", inactive"}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "truncate text-base font-semibold",
                      !e.isActive && "text-muted-foreground",
                    )}
                  >
                    {e.name}
                  </span>
                  {e.phone ? (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatIndianMobile(e.phone)}
                    </span>
                  ) : null}
                </span>
                {e.isActive ? null : <Pill tone="muted">Inactive</Pill>}
                <Pill>{roleLabel(e.role)}</Pill>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        {mode ? (
          <EmployeeSheet
            key={mode.kind === "edit" ? mode.employee.id : "add"}
            outletId={outletId}
            mode={mode}
            onClose={() => setMode(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "muted" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "muted"
          ? "border border-border text-muted-foreground"
          : "bg-muted text-foreground",
      )}
    >
      {children}
    </span>
  );
}

type Field = "name" | "phone" | "role" | "pin";
type Errors = Partial<Record<Field, string>>;

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const key = String(i.path[0]) as Field;
    out[key] ??= i.message;
  }
  return out;
}

function EmployeeSheet({
  outletId,
  mode,
  onClose,
}: {
  outletId: string;
  mode: Exclude<Mode, null>;
  onClose: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.employee : null;
  const ids = { name: useId(), phone: useId(), pin: useId(), error: useId() };

  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ? editing.phone.slice(3) : "");
  const [role, setRole] = useState<Role>(editing?.role ?? "BUTLER");
  const [pin, setPin] = useState(() => (editing ? "" : suggestPin()));
  const [resettingPin, setResettingPin] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** After a PIN is set: show it once so the owner can hand it over. */
  const [shownPin, setShownPin] = useState<{ name: string; pin: string } | null>(null);

  const create = useCreateEmployee(outletId);
  const update = useUpdateEmployee(outletId);
  const savePin = useSetPin(outletId);
  const busy = create.isPending || update.isPending || savePin.isPending;

  const fail = (err: unknown) => setFormError(errorMessage(err));

  /** Inline errors + focus the first invalid field (in form order). */
  const showErrors = (next: Errors) => {
    setErrors(next);
    const first = (["name", "phone", "pin"] as const).find((f) => next[f]);
    if (first) document.getElementById(ids[first])?.focus();
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!editing) {
      const parsed = createEmployeeSchema.safeParse({ name, phone, role, pin });
      if (!parsed.success) return showErrors(fieldErrors(parsed.error.issues));
      try {
        const created = await create.mutateAsync({ name, phone, role, pin });
        setShownPin({ name: created.name, pin: parsed.data.pin });
      } catch (err) {
        fail(err);
      }
      return;
    }
    const parsed = updateEmployeeSchema.safeParse({ name, phone, role });
    if (!parsed.success) return showErrors(fieldErrors(parsed.error.issues));
    try {
      await update.mutateAsync({ id: editing.id, body: { name, phone, role } });
      onClose();
    } catch (err) {
      fail(err);
    }
  }

  async function onSetPin() {
    if (!editing) return;
    setFormError(null);
    const parsed = setPinSchema.safeParse({ pin });
    if (!parsed.success) return showErrors(fieldErrors(parsed.error.issues));
    try {
      await savePin.mutateAsync({ id: editing.id, pin: parsed.data.pin });
      setShownPin({ name: editing.name, pin: parsed.data.pin });
    } catch (err) {
      fail(err);
    }
  }

  async function setActive(isActive: boolean) {
    if (!editing) return;
    setFormError(null);
    try {
      await update.mutateAsync({ id: editing.id, body: { isActive } });
      onClose();
    } catch (err) {
      fail(err);
    }
  }

  const describe = (f: Field) =>
    errors[f] ? { "aria-invalid": true as const, "aria-describedby": `${ids.error}-${f}` } : {};
  const fieldError = (f: Field) =>
    errors[f] ? (
      <p id={`${ids.error}-${f}`} className="text-sm font-medium text-destructive">
        {errors[f]}
      </p>
    ) : null;
  const clear = (f: Field) => errors[f] && setErrors((x) => ({ ...x, [f]: undefined }));

  if (shownPin) {
    return (
      <SheetContent title="PIN Ready" description="Shown once. Share it with them privately.">
        <div className="flex flex-col gap-6 pt-2">
          <div className="flex flex-col items-center gap-2 rounded-md bg-muted px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{shownPin.name}</span> signs in with
            </p>
            <p
              className="text-5xl font-bold tracking-[0.3em] tabular-nums"
              translate="no"
              aria-label={`PIN ${shownPin.pin.split("").join(" ")}`}
            >
              {shownPin.pin}
            </p>
          </div>
          <Button onClick={onClose}>Done</Button>
        </div>
      </SheetContent>
    );
  }

  const pinField = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ids.pin}>{editing ? "New PIN" : "PIN"}</Label>
      <div className="flex gap-2">
        <Input
          id={ids.pin}
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
            clear("pin");
          }}
          className="w-36 text-center text-xl font-semibold tracking-[0.3em] tabular-nums"
          {...describe("pin")}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setPin(suggestPin());
            clear("pin");
          }}
        >
          <RefreshCw aria-hidden="true" />
          New PIN
        </Button>
      </div>
      {fieldError("pin") ?? (
        <p className="text-sm text-muted-foreground">4–6 digits. Avoid 1234 or 1111.</p>
      )}
    </div>
  );

  return (
    <SheetContent title={editing ? `Edit ${editing.name}` : "Add Staff"}>
      <form className="flex flex-col gap-5 pt-2" onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.name}>Name</Label>
          <Input
            id={ids.name}
            name="name"
            autoComplete="off"
            placeholder="e.g. Meera…"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
            {...describe("name")}
          />
          {fieldError("name")}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.phone}>
            Mobile <span className="font-normal">(optional)</span>
          </Label>
          <div className="flex items-stretch gap-2">
            <span
              className="flex h-12 items-center rounded-sm border border-input bg-muted px-3 text-base text-body tabular-nums"
              translate="no"
            >
              +91
            </span>
            <Input
              id={ids.phone}
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              placeholder="98765 43210…"
              maxLength={14}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                clear("phone");
              }}
              className="tabular-nums"
              {...describe("phone")}
            />
          </div>
          {fieldError("phone")}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Role</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label
                key={r.role}
                className={cn(
                  "flex min-h-touch cursor-pointer flex-col gap-0.5 rounded-md border px-4 py-3 transition-[border-color,background-color] duration-150 motion-reduce:transition-none",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  role === r.role
                    ? "border-2 border-foreground bg-muted"
                    : "border-input hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.role}
                  checked={role === r.role}
                  onChange={() => setRole(r.role)}
                  className="sr-only"
                />
                <span className="text-base font-semibold">{r.label}</span>
                <span className="text-sm text-body">{r.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {editing ? null : pinField}

        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {create.isPending || update.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : null}
          {editing
            ? update.isPending
              ? "Saving…"
              : "Save Changes"
            : create.isPending
              ? "Adding…"
              : "Add Staff"}
        </Button>
      </form>

      {editing ? (
        <div className="mt-6 flex flex-col gap-5 border-t border-border pt-6">
          {editing.isActive ? (
            <section className="flex flex-col gap-3" aria-label="PIN">
              {resettingPin ? (
                <>
                  {pinField}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onSetPin()}
                  >
                    {savePin.isPending ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : null}
                    {savePin.isPending ? "Setting PIN…" : "Set New PIN"}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPin(suggestPin());
                    setResettingPin(true);
                  }}
                >
                  Reset PIN
                </Button>
              )}
            </section>
          ) : null}

          {editing.isActive ? (
            confirmDeactivate ? (
              <div
                ref={revealOnMount}
                className="flex scroll-mb-4 flex-col gap-3 rounded-md border border-destructive/40 p-4"
                role="group"
                aria-label="Confirm deactivation"
              >
                <p className="text-sm text-body">
                  {editing.name} will be signed out on every device and can&apos;t sign in until you
                  reactivate them. Their history stays.
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirmDeactivate(false)}
                  >
                    Keep Active
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void setActive(false)}
                  >
                    {update.isPending ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : null}
                    Deactivate {editing.name}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDeactivate(true)}
              >
                Deactivate
              </Button>
            )
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void setActive(true)}
            >
              {update.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Reactivate {editing.name}
            </Button>
          )}
        </div>
      ) : null}
    </SheetContent>
  );
}
