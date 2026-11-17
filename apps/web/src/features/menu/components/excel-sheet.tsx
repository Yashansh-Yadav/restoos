"use client";

import type { ImportPreview, ImportPreviewRow, ImportResult } from "@restoos/shared";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { commitMenuImport, uploadMenuImport } from "../api";
import { useRefreshMenu } from "../hooks";

// Excel (M2-T2/T3): download the template or current menu; upload a filled sheet → preview every
// row (new / update / unchanged / problem) → import in one go. Nothing is saved before "Import".
// English for now; owner screens move to the i18n helper when it lands.

const linkClass =
  "flex min-h-touch-staff items-center gap-3 rounded-md border border-border px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Filter = "error" | "new" | "update" | "all";
type Step =
  | { kind: "start" }
  | { kind: "preview"; preview: ImportPreview }
  | { kind: "done"; result: ImportResult };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ExcelSheet({ outletId, hasItems }: { outletId: string; hasItems: boolean }) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useRefreshMenu(outletId);
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [busy, setBusy] = useState<"upload" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = `?outletId=${encodeURIComponent(outletId)}`;

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      const preview = await uploadMenuImport(outletId, file);
      setStep({ kind: "preview", preview });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status < 500
          ? err.message
          : "Couldn't read the file. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = ""; // the same file can be chosen again
    }
  }

  async function commit(preview: ImportPreview) {
    setBusy("import");
    setError(null);
    try {
      const mode = preview.counts.error > 0 ? "validOnly" : "all";
      const result = await commitMenuImport(outletId, preview.importId, mode);
      await refresh();
      setStep({ kind: "done", result });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status < 500
          ? err.message
          : "Couldn't import. Check your connection and try again — nothing was saved.",
      );
    } finally {
      setBusy(null);
    }
  }

  const fileInput = (
    <input
      ref={fileRef}
      id={`${uid}-file`}
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="sr-only"
      onChange={(e) => void upload(e.target.files?.[0])}
    />
  );

  if (step.kind === "done") {
    const r = step.result;
    return (
      <SheetContent title="Menu Imported">
        <div className="flex flex-col gap-5 pt-2">
          <div className="flex items-start gap-3 rounded-md bg-muted px-4 py-4" role="status">
            <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
            <p className="text-base text-body">
              {plural(r.added, "item", "items")} added, {r.updated} updated
              {r.categoriesAdded > 0
                ? `, ${plural(r.categoriesAdded, "new category", "new categories")}`
                : ""}
              .
              {r.skipped > 0
                ? ` ${plural(r.skipped, "row", "rows")} with problems ${r.skipped === 1 ? "was" : "were"} skipped.`
                : ""}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Add photos and add-ons to the new items from the menu list.
          </p>
        </div>
      </SheetContent>
    );
  }

  if (step.kind === "preview") {
    return (
      <PreviewView
        preview={step.preview}
        busy={busy}
        error={error}
        fileInput={fileInput}
        fileInputId={`${uid}-file`}
        onImport={() => void commit(step.preview)}
      />
    );
  }

  return (
    <SheetContent
      title="Excel"
      description="Fill your whole menu in a spreadsheet instead of one item at a time."
    >
      <div className="flex flex-col gap-3 pt-2">
        <a href={`/api/owner/menu/template.xlsx${q}`} download className={linkClass}>
          <FileSpreadsheet className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-semibold">Download Template</span>
            <span className="text-sm text-pretty text-muted-foreground">
              Empty sheet with example rows, dropdowns for type and GST, and instructions.
            </span>
          </span>
          <Download className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
        {hasItems ? (
          <a href={`/api/owner/menu/export.xlsx${q}`} download className={linkClass}>
            <FileSpreadsheet className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-semibold">Download Current Menu</span>
              <span className="text-sm text-pretty text-muted-foreground">
                Your menu in the same format — edit prices in Excel and import it back.
              </span>
            </span>
            <Download className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </a>
        ) : null}

        <label
          htmlFor={`${uid}-file`}
          className={cn(
            linkClass,
            "cursor-pointer border-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {fileInput}
          {busy === "upload" ? (
            <Loader2 className="size-6 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-6 shrink-0" aria-hidden="true" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-semibold">
              {busy === "upload" ? "Checking Your Sheet…" : "Upload Filled Sheet"}
            </span>
            <span className="text-sm text-pretty text-muted-foreground">
              You&apos;ll see every row with any problems before anything is saved.
            </span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </SheetContent>
  );
}

const STATUS: Record<ImportPreviewRow["status"], { label: string; className: string }> = {
  new: { label: "New", className: "bg-success/15 text-success" },
  update: { label: "Update", className: "bg-muted text-foreground" },
  unchanged: { label: "No change", className: "border border-border text-muted-foreground" },
  error: { label: "Problem", className: "bg-destructive/10 text-destructive" },
};

function PreviewView({
  preview,
  busy,
  error,
  fileInput,
  fileInputId,
  onImport,
}: {
  preview: ImportPreview;
  busy: "upload" | "import" | null;
  error: string | null;
  fileInput: React.ReactNode;
  fileInputId: string;
  onImport: () => void;
}) {
  const { counts } = preview;
  const [filter, setFilter] = useState<Filter>(counts.error > 0 ? "error" : "all");
  const toWrite = counts.new + counts.update;
  const rows = preview.rows.filter((r) => filter === "all" || r.status === filter);
  const filters: { key: Filter; label: string; n: number }[] = [
    { key: "error", label: "Problems", n: counts.error },
    { key: "new", label: "New", n: counts.new },
    { key: "update", label: "Updates", n: counts.update },
    { key: "all", label: "All", n: counts.rows },
  ];

  return (
    <SheetContent title="Check Your Sheet" className="sm:max-w-3xl">
      <div className="flex flex-col gap-4 pt-2">
        <p className="text-base text-body tabular-nums">
          {plural(counts.rows, "row", "rows")}: {counts.new} new · {counts.update}{" "}
          {counts.update === 1 ? "update" : "updates"} · {counts.unchanged} unchanged
          {counts.error > 0 ? (
            <span className="font-semibold text-destructive"> · {counts.error} with problems</span>
          ) : null}
        </p>
        {preview.newCategories.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            New categories:
            {preview.newCategories.map((c) => (
              <span
                key={c}
                className="rounded-full bg-muted px-2.5 py-0.5 font-semibold text-foreground"
              >
                {c}
              </span>
            ))}
          </p>
        ) : null}

        <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2">
          {filters
            .filter((f) => f.n > 0 || f.key === "all")
            .map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex min-h-touch items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  filter === f.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted",
                )}
              >
                {f.label}
                <span className="tabular-nums opacity-80">{f.n}</span>
              </button>
            ))}
        </div>

        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {rows.map((r) => (
            <li key={r.row} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm text-muted-foreground tabular-nums">
                  Row {r.row}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold">{r.name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {[r.category, r.price].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    STATUS[r.status].className,
                  )}
                >
                  {STATUS[r.status].label}
                </span>
              </div>
              {r.changes.length > 0 ? (
                <p className="pl-15 text-sm text-muted-foreground">
                  Changes: {r.changes.join(", ")}
                </p>
              ) : null}
              {r.messages.map((m) => (
                <p
                  key={`${m.column}-${m.message}`}
                  className="pl-15 text-sm font-medium text-destructive"
                >
                  {m.column ? `${m.column}: ` : ""}
                  {m.message}
                </p>
              ))}
            </li>
          ))}
        </ul>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        {counts.error > 0 && toWrite > 0 ? (
          <p className="text-sm text-body">
            Rows with problems will be skipped. Fix them in Excel and upload again to include them.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <label
            htmlFor={fileInputId}
            className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-sm border border-foreground px-6 text-base font-medium hover:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            {fileInput}
            {busy === "upload" ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-5" aria-hidden="true" />
            )}
            {counts.error > 0 ? "Upload Fixed File" : "Upload Another File"}
          </label>
          {toWrite > 0 ? (
            <Button disabled={busy !== null} onClick={onImport}>
              {busy === "import" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {busy === "import"
                ? "Importing…"
                : counts.error > 0
                  ? `Import ${plural(toWrite, "Valid Row", "Valid Rows")} Only`
                  : `Import ${plural(toWrite, "Item", "Items")}`}
            </Button>
          ) : (
            <p className="self-center text-sm text-muted-foreground">Nothing new to import.</p>
          )}
        </div>
      </div>
    </SheetContent>
  );
}
