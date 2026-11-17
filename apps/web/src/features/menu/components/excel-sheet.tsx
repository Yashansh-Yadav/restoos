"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { SheetContent } from "@/components/ui/sheet";

// Excel (M2-T2): download the template, or the current menu to edit and re-import.
// Plain links: the browser sends the session cookie; the outlet goes in the query string.
// Upload + preview arrives in M2-T3.

const linkClass =
  "flex min-h-touch-staff items-center gap-3 rounded-md border border-border px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ExcelSheet({ outletId, hasItems }: { outletId: string; hasItems: boolean }) {
  const q = `?outletId=${encodeURIComponent(outletId)}`;
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
        <p className="rounded-md bg-muted px-4 py-3 text-sm text-pretty text-body">
          Uploading the filled sheet is coming next. You&apos;ll see a preview of every row, with
          any problems, before anything is saved.
        </p>
      </div>
    </SheetContent>
  );
}
