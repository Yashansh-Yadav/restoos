"use client";

import { formatINR, type PublicMenu } from "@restoos/shared";
import { CheckCircle2, Minus, Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { DietMarker } from "@/features/menu/components/diet-marker";
import { useTableSocket } from "@/features/realtime/use-outlet-socket";
import { cn } from "@/lib/utils";
import { displayName, filterMenu, type MenuItem } from "../filter";
import { usePublicMenu, useTableOrders } from "../hooks";
import { useGuestOrdering, type GuestOrdering } from "./guest-ordering";
import { LanguageToggle } from "./language-toggle";
import { YourOrders } from "./your-orders";

// Customer menu (M5-T6a, DESIGN.md "Customer menu"): sticky header with outlet, table, language
// and Veg Only; pill search; a category strip that follows the scroll; dish cards with diet
// marker, price and optional photo. Out-of-stock dishes stay listed, greyed, with a label.
// Live via the table socket: stock and menu changes show up without a reload.
// M5-T6b: when the outlet allows guest ordering — Add / steppers, the order bar, Place Order,
// and "Your Orders" with live status.

const EAGER_IMAGES = 4;

export function CustomerMenu({ qrToken, initial }: { qrToken: string; initial: PublicMenu }) {
  const t = useTranslations("customer.menu");
  const locale = useLocale();
  const { data } = usePublicMenu(qrToken, initial);
  useTableSocket(qrToken);
  const ordering = useGuestOrdering(qrToken, data);
  const { data: tableOrders } = useTableOrders(qrToken, ordering.enabled);

  const [vegOnly, setVegOnly] = useState(false);
  const [query, setQuery] = useState("");
  const categories = useMemo(
    () => filterMenu(data.menu.categories, { vegOnly, query }),
    [data.menu.categories, vegOnly, query],
  );
  const hasAnyItem = data.menu.categories.some((c) => c.items.length > 0);

  // Sticky header height → scroll offset for sections (it wraps differently per language).
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(176);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The category under the header is the active one in the strip.
  const [active, setActive] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-category]")];
    if (sections.length === 0) return;
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = sections.find((s) => visible.get(s.id));
        if (first) setActive(first.dataset.category ?? null);
      },
      { rootMargin: `-${headerHeight + 1}px 0px -55% 0px` },
    );
    for (const s of sections) io.observe(s);
    return () => io.disconnect();
  }, [categories, headerHeight]);
  useEffect(() => {
    if (!active) return;
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const jumpTo = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`cat-${id}`)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActive(id);
  };

  const shownActive = active ?? categories[0]?.id ?? null;

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col"
      style={{ ["--header-h" as string]: `${headerHeight}px` }}
    >
      <header
        ref={headerRef}
        className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-xl font-bold" translate="no">
              {data.outlet.name}
            </h1>
            <p className="text-sm text-muted-foreground" translate="no">
              {t("table", { label: data.table.label })}
            </p>
          </div>
          <LanguageToggle />
        </div>

        <div className="flex items-center gap-2">
          <label className="relative flex min-w-0 flex-1 items-center">
            <span className="sr-only">{t("search")}</span>
            <Search
              className="pointer-events-none absolute left-4 size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-12 w-full min-w-0 rounded-full border border-input bg-background pr-12 pl-11 text-base placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("clear")}
                className="absolute right-1 inline-flex size-touch items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={vegOnly}
            onClick={() => setVegOnly((v) => !v)}
            className={cn(
              "inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors duration-150",
              vegOnly
                ? "border-veg bg-veg/15 text-foreground ring-1 ring-veg"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            <DietMarker diet="VEG" decorative />
            {t("vegOnly")}
          </button>
        </div>

        {categories.length > 1 ? (
          <nav aria-label={t("sections")} className="-mx-4">
            <div
              ref={stripRef}
              className="flex [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain px-2"
            >
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-tab={c.id}
                  aria-current={shownActive === c.id ? "true" : undefined}
                  onClick={() => jumpTo(c.id)}
                  className={cn(
                    "min-h-touch shrink-0 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                    shownActive === c.id
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {displayName(c, locale)}
                </button>
              ))}
            </div>
          </nav>
        ) : (
          <div className="h-1" aria-hidden="true" />
        )}
      </header>

      <main
        className={cn("flex flex-1 flex-col gap-6 px-4 pt-4", ordering.hasBar ? "pb-28" : "pb-10")}
      >
        {ordering.notice ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-base font-medium"
          >
            <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
            {ordering.notice}
          </p>
        ) : null}
        {tableOrders ? <YourOrders orders={tableOrders.orders} /> : null}
        {!hasAnyItem ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-base text-muted-foreground">
            {t("empty")}
          </p>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <p className="text-base text-muted-foreground" role="status">
              {query.trim() ? t("noMatch", { query: query.trim() }) : t("noVeg")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="min-h-touch rounded-full border border-input px-4 text-sm font-semibold hover:bg-muted"
                >
                  {t("clear")}
                </button>
              ) : null}
              {vegOnly ? (
                <button
                  type="button"
                  onClick={() => setVegOnly(false)}
                  className="min-h-touch rounded-full border border-input px-4 text-sm font-semibold hover:bg-muted"
                >
                  {t("showAll")}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          categories.map((c, ci) => (
            <section
              key={c.id}
              id={`cat-${c.id}`}
              data-category={c.id}
              aria-labelledby={`cat-${c.id}-title`}
              className="flex scroll-mt-[calc(var(--header-h)+0.5rem)] flex-col gap-1"
            >
              <h2 id={`cat-${c.id}-title`} className="text-lg font-bold">
                {displayName(c, locale)}
              </h2>
              <ul className="flex flex-col divide-y divide-border">
                {c.items.map((item, ii) => (
                  <Dish
                    key={item.id}
                    item={item}
                    locale={locale}
                    eager={ci === 0 && ii < EAGER_IMAGES}
                    ordering={ordering}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        <p className="pt-2 text-center text-sm text-muted-foreground">
          {data.outlet.pricesIncludeTax ? t("pricesInclude") : t("pricesExclude")}
        </p>
      </main>
      {ordering.layer}
    </div>
  );
}

function Dish({
  item,
  locale,
  eager,
  ordering,
}: {
  item: MenuItem;
  locale: string;
  eager: boolean;
  ordering: GuestOrdering;
}) {
  const t = useTranslations("customer.menu");
  const name = displayName(item, locale);
  const showEnglish = name !== item.name;
  const price = formatINR(item.price, { paise: "auto" });
  return (
    <li className="flex items-start gap-3 py-4" data-out-of-stock={!item.inStock || undefined}>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", !item.inStock && "opacity-60")}>
        <div className="flex items-start gap-2">
          <DietMarker diet={item.dietType} className="mt-1" label={t(`diet.${item.dietType}`)} />
          <h3 className="text-base font-semibold" translate="no">
            {name}
            {showEnglish ? (
              <span className="block text-sm font-normal text-muted-foreground" lang="en">
                {item.name}
              </span>
            ) : null}
          </h3>
        </div>
        {item.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground" lang="en">
            {item.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold tabular-nums">
            {item.variants.length > 1 ? t("from", { price }) : price}
          </span>
          {!item.inStock ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
              {t("outOfStock")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-2">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            width={88}
            height={88}
            unoptimized
            loading={eager ? "eager" : "lazy"}
            className={cn(
              "size-22 shrink-0 rounded-md bg-muted object-cover",
              !item.inStock && "opacity-50 grayscale",
            )}
          />
        ) : null}
        {ordering.enabled && item.inStock ? (
          <AddControl item={item} name={name} ordering={ordering} />
        ) : null}
      </div>
    </li>
  );
}

/** "Add" pill → − n + for a plain dish; dishes with sizes/add-ons always open their choices. */
function AddControl({
  item,
  name,
  ordering,
}: {
  item: MenuItem;
  name: string;
  ordering: GuestOrdering;
}) {
  const t = useTranslations("customer.order");
  const plain = !ordering.hasChoices(item);
  const n = plain ? ordering.plainCount(item) : ordering.countOf(item.id);
  if (plain && n > 0) {
    return (
      <div
        role="group"
        aria-label={name}
        className="flex h-11 items-center rounded-full border border-foreground"
      >
        <button
          type="button"
          aria-label={t("oneLess", { name })}
          onClick={() => ordering.step(item, -1)}
          className="inline-flex size-11 items-center justify-center rounded-full"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span className="w-6 text-center text-base font-bold tabular-nums" aria-live="polite">
          {n}
        </span>
        <button
          type="button"
          aria-label={t("oneMore", { name })}
          onClick={() => ordering.step(item, 1)}
          className="inline-flex size-11 items-center justify-center rounded-full"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={t("addName", { name })}
      onClick={() => ordering.tapAdd(item)}
      className="inline-flex h-11 min-w-22 items-center justify-center gap-1 rounded-full border border-foreground px-4 text-sm font-semibold hover:bg-muted"
    >
      <Plus className="size-4" aria-hidden="true" />
      {t("add")}
      {n > 0 ? <span className="tabular-nums">({n})</span> : null}
    </button>
  );
}
