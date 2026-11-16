import { modelScope, type ModelScope, type PrismaClient } from "@restoos/db";

// Tenant isolation (plan §5.3, CLAUDE.md rule 3). Feature modules never touch the raw Prisma
// client: they call getTenantDb(ctx), which adds the tenant to every query so a forgotten
// `where: { organizationId }` cannot leak one restaurant's data to another.
//
// What it guarantees:
// - Reads/updates/deletes only ever match rows of ctx.organizationId (and ctx.outletId, when set,
//   for outlet-scoped models). Another tenant's id behaves exactly like a missing row.
// - Creates get organizationId (and outletId from ctx) filled in; a different org, or an outlet
//   of another org, throws TenantViolationError.
// - Better Auth tables are unreachable; plans are read-only; raw SQL is blocked.
// What it does not do (service code must):
// - Nested writes are not rewritten — child rows set organizationId themselves (it's required).
// - Foreign keys (categoryId, tableId…) are not checked: load referenced rows through the tenant
//   client first; another tenant's row then comes back as not found.

export type Actor =
  | { kind: "owner"; userId: string }
  | { kind: "staff"; employeeId: string }
  | { kind: "system"; reason: string };

export type TenantContext = {
  organizationId: string;
  /** Set for outlet-bound work (staff devices); owners working across outlets leave it unset. */
  outletId?: string;
  actor: Actor;
};

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
/** Operations whose `where` is a unique input (scope added via AND, never by overwriting keys). */
const UNIQUE_WHERE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const UPDATE_OPS = new Set(["update", "updateMany", "updateManyAndReturn"]);

type Args = Record<string, unknown>;
type Data = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function scopeFilter(ctx: TenantContext, scope: ModelScope): Record<string, string> {
  if (scope === "organization-root") return { id: ctx.organizationId };
  const filter: Record<string, string> = { organizationId: ctx.organizationId };
  if (ctx.outletId && (scope === "outlet" || scope === "outlet-optional")) {
    filter.outletId = ctx.outletId;
  }
  return filter;
}

function withScope(where: unknown, filter: Record<string, string>, unique: boolean): Args {
  if (unique) {
    // Unique inputs must keep their unique key at the top level; extra filters go in AND.
    const base = isRecord(where) ? where : {};
    const and: unknown[] =
      base.AND === undefined ? [] : Array.isArray(base.AND) ? (base.AND as unknown[]) : [base.AND];
    return { ...base, AND: [...and, filter] };
  }
  return isRecord(where) ? { AND: [where, filter] } : { ...filter };
}

export function createTenantDbFactory(prisma: PrismaClient) {
  return function getTenantDb(ctx: TenantContext) {
    // Outlets confirmed to belong to ctx.organizationId (cached for this client's lifetime).
    const ownOutlets = new Set<string>();

    async function assertOwnOutlet(outletId: unknown, model: string): Promise<void> {
      if (typeof outletId !== "string") {
        throw new TenantViolationError(`${model}: outletId must be a string`);
      }
      if (ctx.outletId) {
        if (outletId !== ctx.outletId) {
          throw new TenantViolationError(`${model}: outlet ${outletId} is outside this context`);
        }
        return;
      }
      if (ownOutlets.has(outletId)) return;
      const found = await prisma.outlet.count({
        where: { id: outletId, organizationId: ctx.organizationId },
      });
      if (found === 0) {
        throw new TenantViolationError(
          `${model}: outlet ${outletId} belongs to another organisation`,
        );
      }
      ownOutlets.add(outletId);
    }

    /** Checks (and for creates, fills) the tenant columns of one data object. */
    async function checkData(model: string, scope: ModelScope, data: unknown, create: boolean) {
      if (!isRecord(data)) return data;
      if ("organization" in data) {
        throw new TenantViolationError(
          `${model}: set organizationId, not the organization relation`,
        );
      }
      const out: Data = { ...data };
      if (scope === "organization-root") {
        if ("id" in out && out.id !== ctx.organizationId) {
          throw new TenantViolationError(`${model}: cannot change the organisation id`);
        }
        return out;
      }
      if ("organizationId" in out && out.organizationId !== ctx.organizationId) {
        throw new TenantViolationError(`${model}: organizationId belongs to another organisation`);
      }
      if (create) out.organizationId = ctx.organizationId;

      if (scope === "outlet" || scope === "outlet-optional") {
        if ("outlet" in out) {
          const connect =
            isRecord(out.outlet) && isRecord(out.outlet.connect) ? out.outlet.connect : null;
          await assertOwnOutlet(connect?.id, model);
        } else if ("outletId" in out && out.outletId !== null) {
          await assertOwnOutlet(out.outletId, model);
        } else if (create && ctx.outletId && !("outletId" in out)) {
          out.outletId = ctx.outletId;
        }
      }
      return out;
    }

    async function scopeArgs(model: string, operation: string, rawArgs: unknown): Promise<Args> {
      const scope = modelScope(model);
      if (!scope) throw new TenantViolationError(`Unknown model ${model}`);
      if (scope === "auth") {
        throw new TenantViolationError(`${model} is not available through a tenant client`);
      }
      const args: Args = isRecord(rawArgs) ? { ...rawArgs } : {};
      if (scope === "global") {
        if (!READ_OPS.has(operation)) {
          throw new TenantViolationError(`${model} is read-only for tenants`);
        }
        return args;
      }
      if (
        scope === "organization-root" &&
        (CREATE_OPS.has(operation) || operation === "upsert" || operation.startsWith("delete"))
      ) {
        throw new TenantViolationError(`${model} cannot be created or deleted by a tenant`);
      }

      if (!CREATE_OPS.has(operation)) {
        args.where = withScope(
          args.where,
          scopeFilter(ctx, scope),
          UNIQUE_WHERE_OPS.has(operation),
        );
      }
      if (CREATE_OPS.has(operation)) {
        args.data = Array.isArray(args.data)
          ? await Promise.all(args.data.map((d: unknown) => checkData(model, scope, d, true)))
          : await checkData(model, scope, args.data, true);
      } else if (UPDATE_OPS.has(operation)) {
        args.data = await checkData(model, scope, args.data, false);
      } else if (operation === "upsert") {
        args.create = await checkData(model, scope, args.create, true);
        args.update = await checkData(model, scope, args.update, false);
      }
      return args;
    }

    const rawSqlBlocked = () => {
      throw new TenantViolationError(
        "Raw SQL is not available through a tenant client — add a lib/ helper that scopes it",
      );
    };

    const client = prisma.$extends({
      name: "tenant",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            // The scoped args have the same shape as the originals, plus tenant filters.
            return query(await scopeArgs(model, operation, args));
          },
        },
        $queryRaw: rawSqlBlocked,
        $executeRaw: rawSqlBlocked,
        $queryRawUnsafe: rawSqlBlocked,
        $executeRawUnsafe: rawSqlBlocked,
      },
    });
    // A query-only extension keeps PrismaClient's model API; narrow it to what tenants may use.
    return client as unknown as TenantDb;
  };
}

type Hidden =
  | "$queryRaw"
  | "$executeRaw"
  | "$queryRawUnsafe"
  | "$executeRawUnsafe"
  | "$queryRawTyped"
  | "$extends"
  | "$connect"
  | "$disconnect"
  | "$on"
  | "user"
  | "session"
  | "account"
  | "verification";

/** The tenant-scoped client: model delegates and $transaction, without raw SQL or auth tables. */
export type TenantDb = Omit<PrismaClient, Hidden>;
export type GetTenantDb = (ctx: TenantContext) => TenantDb;
