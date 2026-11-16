"use client";

import {
  billingStepSchema,
  businessStepSchema,
  financialYear,
  formatInvoiceNumber,
  GST_STATES,
  OUTLET_INVOICE_CODE,
  onboardingRequestSchema,
  outletStepSchema,
  suggestOutletCode,
} from "@restoos/shared";
import { Check, Loader2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { submitOnboarding } from "../api";

// Onboarding wizard (M1-T2): 3 steps in one form, one POST at the end — nothing is half-saved.
// Each step is validated with the same shared zod schema the API enforces (rule 10).
// English for now; owner screens move to the i18n helper when it lands.

type Values = {
  brandName: string;
  legalName: string;
  orgGstin: string;
  outletName: string;
  address: string;
  stateCode: string;
  outletGstin: string;
  fssai: string;
  pricesIncludeTax: boolean;
  code: string;
};
type Field = Exclude<keyof Values, "pricesIncludeTax">;
type Errors = Partial<Record<Field, string>>;

const EMPTY: Values = {
  brandName: "",
  legalName: "",
  orgGstin: "",
  outletName: "",
  address: "",
  stateCode: "",
  outletGstin: "",
  fssai: "",
  pricesIncludeTax: false,
  code: "",
};

// Each step: its schema, how form values map onto it, and which schema key is which field.
const STEPS = [
  {
    title: "Your Business",
    intro: "How customers know you, and the name printed on GST bills.",
    schema: businessStepSchema,
    input: (v: Values) => ({ name: v.brandName, legalName: v.legalName, gstin: v.orgGstin }),
    fields: { name: "brandName", legalName: "legalName", gstin: "orgGstin" },
  },
  {
    title: "Your Outlet",
    intro: "Your first location. You can add more outlets later.",
    schema: outletStepSchema,
    input: (v: Values) => ({
      name: v.outletName,
      address: v.address,
      stateCode: v.stateCode,
      gstin: v.outletGstin,
      fssaiNumber: v.fssai,
    }),
    fields: {
      name: "outletName",
      address: "address",
      stateCode: "stateCode",
      gstin: "outletGstin",
      fssaiNumber: "fssai",
    },
  },
  {
    title: "Billing Setup",
    intro: "How prices and invoice numbers work at this outlet.",
    schema: billingStepSchema,
    input: (v: Values) => ({ pricesIncludeTax: v.pricesIncludeTax, code: v.code }),
    fields: { code: "code" },
  },
] as const satisfies readonly {
  title: string;
  intro: string;
  schema: z.ZodType;
  input: (v: Values) => object;
  fields: Record<string, Field>;
}[];

function validateStep(step: number, values: Values): Errors {
  const def = STEPS[step];
  if (!def) return {};
  const result = def.schema.safeParse(def.input(values));
  if (result.success) return {};
  const errors: Errors = {};
  const fields: Record<string, Field> = def.fields;
  for (const issue of result.error.issues) {
    const field = fields[String(issue.path[0])];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function OnboardingWizard() {
  const formId = useId();
  const id = (f: Field) => `${formId}-${f}`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Move focus to the new step's heading so screen readers announce it (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Nothing is saved until "Finish Setup", so warn before a reload/close throws typed answers away.
  const dirty = values.brandName.trim() !== "" || values.legalName.trim() !== "";
  useEffect(() => {
    if (!dirty || busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);

  const set = (field: keyof Values, value: string | boolean) => {
    setValues((v) => ({ ...v, [field]: value }));
    // Clear a shown error as soon as the user edits that field.
    if (field in errors) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // Validate on blur, but only fields with something typed (don't nag about untouched ones).
  const onBlur = (field: Field) => {
    if (!values[field].trim()) return;
    const message = validateStep(step, values)[field];
    if (message) setErrors((e) => ({ ...e, [field]: message }));
  };

  const goTo = (next: number) => {
    // Carry earlier answers forward so the owner never retypes them.
    setValues((v) => {
      const gstin = v.orgGstin.trim().toUpperCase();
      const stateFromGstin = GST_STATES.find((s) => s.code === gstin.slice(0, 2))?.code;
      return {
        ...v,
        outletName: v.outletName || v.brandName.trim(),
        outletGstin: v.outletGstin || gstin,
        stateCode: v.stateCode || stateFromGstin || "",
        code: codeTouched ? v.code : suggestOutletCode(v.brandName),
      };
    });
    setErrors({});
    setSubmitError(null);
    setStep(next);
  };

  const failStep = (stepErrors: Errors) => {
    setErrors(stepErrors);
    const first = Object.keys(stepErrors)[0];
    if (first) document.getElementById(id(first as Field))?.focus();
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const stepErrors = validateStep(step, values);
    if (Object.keys(stepErrors).length > 0) return failStep(stepErrors);
    if (step < STEPS.length - 1) return goTo(step + 1);

    setBusy(true);
    setSubmitError(null);
    try {
      // Every step is already valid; parsing again gives the normalised request (trimmed, upper-cased).
      const body = onboardingRequestSchema.parse({
        organization: STEPS[0].input(values),
        outlet: { ...STEPS[1].input(values), ...STEPS[2].input(values) },
      });
      await submitOnboarding(body);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_ONBOARDED") {
        // Set up already (e.g. in another tab) — go to the owner area.
      } else {
        setBusy(false);
        setSubmitError(
          err instanceof ApiError && err.status === 401
            ? "Your session has ended. Sign in again to finish setup."
            : "Couldn't save your restaurant. Check your connection and try again.",
        );
        return;
      }
    }
    // Full page load: the owner area re-reads who you are and now finds the restaurant.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload after tenant creation
    window.location.assign("/owner");
  }

  const def = STEPS[step] ?? STEPS[0];
  const field = (f: Field) => ({
    id: id(f),
    name: f,
    value: values[f],
    onChange: (e: { target: { value: string } }) => set(f, e.target.value),
    onBlur: () => onBlur(f),
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": `${id(f)}-desc`,
  });

  const codeValid = OUTLET_INVOICE_CODE.test(values.code.trim().toUpperCase());
  const preview = codeValid
    ? formatInvoiceNumber(values.code.trim().toUpperCase(), financialYear(new Date()), "D1", 1)
    : null;

  return (
    <form className="flex flex-col gap-8" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="flex flex-col gap-3">
        <Progress step={step} />
        <div className="flex flex-col gap-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[28px] leading-tight font-bold text-balance outline-none"
          >
            {def.title}
          </h1>
          <p className="text-base text-pretty text-body">{def.intro}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {step === 0 ? (
          <>
            <FormField id={id("brandName")} label="Brand Name" error={errors.brandName}>
              <Input
                {...field("brandName")}
                autoComplete="organization"
                placeholder="e.g. Saffron Table…"
              />
            </FormField>
            <FormField
              id={id("legalName")}
              label="Legal Name"
              hint="As registered — printed on GST bills."
              error={errors.legalName}
            >
              <Input
                {...field("legalName")}
                autoComplete="off"
                placeholder="e.g. Saffron Table Hospitality Pvt Ltd…"
              />
            </FormField>
            <FormField
              id={id("orgGstin")}
              label="Business GSTIN"
              optional
              hint="Skip if you're not GST-registered yet."
              error={errors.orgGstin}
            >
              <GstinInput {...field("orgGstin")} />
            </FormField>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <FormField id={id("outletName")} label="Outlet Name" error={errors.outletName}>
              <Input
                {...field("outletName")}
                autoComplete="off"
                placeholder="e.g. Saffron Table — Bandra…"
              />
            </FormField>
            <FormField
              id={id("address")}
              label="Address"
              hint="Printed on bills. Include the PIN code."
              error={errors.address}
            >
              <Textarea {...field("address")} autoComplete="street-address" rows={3} />
            </FormField>
            <FormField id={id("stateCode")} label="State" error={errors.stateCode}>
              <NativeSelect {...field("stateCode")} autoComplete="address-level1">
                <option value="" disabled>
                  Choose a state…
                </option>
                {GST_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              id={id("outletGstin")}
              label="Outlet GSTIN"
              optional
              hint="Must be registered in the state above."
              error={errors.outletGstin}
            >
              <GstinInput {...field("outletGstin")} />
            </FormField>
            <FormField
              id={id("fssai")}
              label="FSSAI Licence Number"
              optional
              hint="14 digits. You can add it later, but bills need it before you go live."
              error={errors.fssai}
            >
              <Input
                {...field("fssai")}
                inputMode="numeric"
                maxLength={14}
                spellCheck={false}
                autoComplete="off"
                className="tabular-nums"
              />
            </FormField>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium text-muted-foreground">
                Do your menu prices include GST?
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ChoiceCard
                  name="pricesIncludeTax"
                  checked={!values.pricesIncludeTax}
                  onChange={() => set("pricesIncludeTax", false)}
                  title="No, GST is Added"
                  description="₹100 item → bill shows ₹100 + GST."
                />
                <ChoiceCard
                  name="pricesIncludeTax"
                  checked={values.pricesIncludeTax}
                  onChange={() => set("pricesIncludeTax", true)}
                  title="Yes, Prices Include GST"
                  description="₹100 item → bill total stays ₹100."
                />
              </div>
            </fieldset>
            <FormField
              id={id("code")}
              label="Invoice Code"
              hint="2 letters or digits that start every bill number. Can't change once you bill."
              error={errors.code}
            >
              <Input
                {...field("code")}
                onChange={(e) => {
                  setCodeTouched(true);
                  set(
                    "code",
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 2),
                  );
                }}
                maxLength={2}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="w-24 text-center text-lg font-semibold tracking-widest uppercase"
              />
            </FormField>
            <div className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3" aria-live="polite">
              <p className="text-sm font-medium text-muted-foreground">First Bill Number</p>
              <p className="text-xl font-semibold text-foreground tabular-nums" translate="no">
                {preview ?? "—"}
              </p>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setErrors({});
                setSubmitError(null);
                setStep(step - 1);
              }}
            >
              Back
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <Button type="submit" disabled={busy} className="sm:min-w-44">
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {step < STEPS.length - 1 ? "Continue" : busy ? "Setting Up…" : "Finish Setup"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground tabular-nums">
        Step {step + 1} of {STEPS.length}
      </p>
      <ol className="grid grid-cols-3 gap-2" aria-label="Setup Progress">
        {STEPS.map((s, i) => (
          <li key={s.title} aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "block h-1 rounded-full transition-colors duration-200 motion-reduce:transition-none",
                i <= step ? "bg-foreground" : "bg-border",
              )}
            />
            <span className="sr-only">
              {s.title}
              {i < step ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FormField({
  id,
  label,
  hint,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal"> (optional)</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-desc`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-desc`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function GstinInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      maxLength={15}
      autoCapitalize="characters"
      autoComplete="off"
      spellCheck={false}
      placeholder="e.g. 27AAPFU0939F1ZV…"
      className="uppercase tabular-nums placeholder:normal-case"
    />
  );
}

function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-touch cursor-pointer flex-col gap-1 rounded-md border px-4 py-3 transition-[border-color,background-color] duration-150 motion-reduce:transition-none",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
        checked ? "border-2 border-foreground bg-muted" : "border-input hover:bg-muted",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className="flex items-center justify-between gap-2 text-base font-semibold text-foreground">
        {title}
        {checked ? <Check className="size-5 shrink-0" aria-hidden="true" /> : null}
      </span>
      <span className="text-sm text-body">{description}</span>
    </label>
  );
}
