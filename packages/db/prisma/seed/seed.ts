// `pnpm db:seed` — plans (always upserted) + one demo tenant (created once). Safe to run repeatedly.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "@node-rs/argon2";
import { createPrismaClient, type PrismaClient } from "../../src/index";
import { ADD_ON_GROUPS, MENU, type AddOnGroupKey } from "./menu";
import { LIMIT_KEYS, PLANS } from "./plans";
import { DEMO_DEVICES, DEMO_ORG, DEMO_OUTLET, DEMO_SECTIONS, DEMO_STAFF } from "./tenant";

const rootEnv = resolve(import.meta.dirname, "../../../../.env");
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

const token = (bytes = 16) => randomBytes(bytes).toString("base64url");

async function seedPlans(db: PrismaClient): Promise<void> {
  for (const p of PLANS) {
    const data = {
      name: p.name,
      kind: p.kind,
      monthlyPrice: p.monthlyPrice ?? null,
      annualPrice: p.annualPrice ?? null,
      oneTimePrice: p.oneTimePrice ?? null,
      amcPrice: p.amcPrice ?? null,
    };
    const plan = await db.plan.upsert({
      where: { key: p.key },
      create: { key: p.key, ...data },
      update: data,
    });
    await db.planFeature.deleteMany({ where: { planId: plan.id } });
    await db.planFeature.createMany({
      data: [
        ...p.features.map((featureKey) => ({ planId: plan.id, featureKey, limitValue: null })),
        ...LIMIT_KEYS.map((featureKey) => ({
          planId: plan.id,
          featureKey,
          limitValue: p.limits[featureKey],
        })),
      ],
    });
  }
  console.log(`✔ ${PLANS.length} plans with features and limits`);
}

async function seedDemoTenant(db: PrismaClient): Promise<void> {
  const existing = await db.organization.findFirst({ where: { name: DEMO_ORG.name } });
  if (existing) {
    console.log("✔ demo tenant already present (run `pnpm db:reset` to recreate it)");
    return;
  }

  // Hash outside the transaction: argon2 is deliberately slow.
  const staff = await Promise.all(
    DEMO_STAFF.map(async (s) => ({ ...s, pinHash: await hash(s.pin) })),
  );
  const devices = await Promise.all(
    DEMO_DEVICES.map(async (d) => ({ ...d, deviceSecretHash: await hash(token(32)) })),
  );

  await db.$transaction(
    async (tx) => {
      const org = await tx.organization.create({ data: DEMO_ORG });
      const organizationId = org.id;
      const outlet = await tx.outlet.create({ data: { ...DEMO_OUTLET, organizationId } });
      const outletId = outlet.id;
      const scope = { organizationId, outletId };

      let tableNo = 1;
      for (const s of DEMO_SECTIONS) {
        const section = await tx.section.create({
          data: { ...scope, name: s.name, sortOrder: s.sortOrder },
        });
        for (let i = 0; i < s.tables; i++, tableNo++) {
          await tx.diningTable.create({
            data: {
              ...scope,
              sectionId: section.id,
              label: `T${tableNo}`,
              seats: tableNo % 3 === 0 ? 6 : tableNo % 2 === 0 ? 2 : 4,
              qrToken: token(),
              posX: i % 4,
              posY: Math.floor(i / 4),
            },
          });
        }
      }

      await tx.employee.createMany({
        data: staff.map((s) => ({ ...scope, name: s.name, role: s.role, pinHash: s.pinHash })),
      });
      await tx.device.createMany({
        data: devices.map((d) => ({
          ...scope,
          code: d.code,
          label: d.label,
          isStation: d.isStation,
          deviceSecretHash: d.deviceSecretHash,
        })),
      });

      const groupIds = {} as Record<AddOnGroupKey, string>;
      for (const [key, g] of Object.entries(ADD_ON_GROUPS) as [
        AddOnGroupKey,
        (typeof ADD_ON_GROUPS)[AddOnGroupKey],
      ][]) {
        const group = await tx.addOnGroup.create({
          data: {
            ...scope,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            addOns: {
              create: g.addOns.map((a) => ({ organizationId, name: a.name, price: a.price })),
            },
          },
        });
        groupIds[key] = group.id;
      }

      for (const [ci, c] of MENU.entries()) {
        const category = await tx.menuCategory.create({
          data: { ...scope, name: c.name, nameHi: c.nameHi, sortOrder: ci },
        });
        for (const [ii, item] of c.items.entries()) {
          await tx.menuItem.create({
            data: {
              ...scope,
              categoryId: category.id,
              code: item.code,
              name: item.name,
              nameHi: item.nameHi,
              description: item.description ?? null,
              dietType: item.diet,
              basePrice: item.price,
              taxRateBps: item.taxRateBps,
              hsnSac: item.hsnSac,
              sortOrder: ii,
              variants: {
                create: (item.variants ?? []).map((v, vi) => ({
                  organizationId,
                  name: v.name,
                  price: v.price,
                  sortOrder: vi,
                })),
              },
              addOnGroups: {
                create: (item.addOnGroups ?? []).map((k) => ({
                  organizationId,
                  groupId: groupIds[k],
                })),
              },
            },
          });
        }
      }
    },
    { timeout: 60_000 },
  );

  const items = MENU.reduce((n, c) => n + c.items.length, 0);
  console.log(
    `✔ demo tenant "${DEMO_ORG.name}" · outlet ${DEMO_OUTLET.code} · ` +
      `${DEMO_SECTIONS.length} sections · 12 tables · ${DEMO_STAFF.length} staff · ` +
      `${MENU.length} categories / ${items} items · ${DEMO_DEVICES.length} devices`,
  );
}

function printPins(): void {
  console.log("\nDemo staff PINs (local development only):");
  console.table(DEMO_STAFF.map((s) => ({ name: s.name, role: s.role, pin: s.pin })));
}

const db = createPrismaClient(databaseUrl);
try {
  await seedPlans(db);
  await seedDemoTenant(db);
  printPins();
} finally {
  await db.$disconnect();
}
