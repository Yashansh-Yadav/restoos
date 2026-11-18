// Shared integration fixtures (M1-T6/T7): an onboarded restaurant with owner helpers, and
// independent "browsers" (cookie jars) for restaurant devices.
import { employeeSchema, pairingCodeResponseSchema } from "@restoos/shared";
import { OUTLET_HEADER } from "../plugins/tenant";
import { ORIGIN, type createAuthHarness } from "./auth-harness";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;

/** A browser of its own (cookie jar), e.g. the restaurant's counter tablet. */
export function browser(h: Harness) {
  const jar = new Map<string, string>();
  return {
    jar,
    async call(
      method: "GET" | "POST" | "PATCH" | "PUT",
      url: string,
      payload?: object,
      ip = "198.51.100.1",
    ) {
      const res = await h.app.inject({
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: {
          origin: ORIGIN,
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          "x-forwarded-for": ip,
        },
        remoteAddress: ip,
      });
      for (const c of res.cookies) {
        if (c.maxAge === 0 || c.value === "" || (c.expires && c.expires.getTime() < Date.now())) {
          jar.delete(c.name);
        } else jar.set(c.name, c.value);
      }
      return res;
    },
  };
}

/** Signs in a new owner, onboards, and returns helpers bound to their outlet. */
export async function restaurant(h: Harness, phone = "+919876543210") {
  await h.signInWithPhone(phone);
  const onboarded = await h.request("POST", "/api/onboarding", {
    organization: { name: "Saffron Table", legalName: "Saffron Table Pvt Ltd" },
    outlet: {
      name: "Bandra",
      address: "12 Hill Road, Bandra West, Mumbai 400050",
      stateCode: "27",
      pricesIncludeTax: false,
      code: "ST",
    },
  });
  const { organizationId, outletId } = onboarded.json<{
    organizationId: string;
    outletId: string;
  }>();
  const ownerCookie = () => [...h.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const owner = (method: "GET" | "POST" | "PATCH" | "PUT", url: string, body?: object) =>
    h.app.inject({
      method,
      url,
      ...(body ? { payload: body } : {}),
      headers: { origin: ORIGIN, [OUTLET_HEADER]: outletId, cookie: ownerCookie() },
    });
  const addStaff = async (name: string, role: string, pin: string) =>
    employeeSchema.parse((await owner("POST", "/api/owner/staff", { name, role, pin })).json());
  const newDevice = async (label = "Counter tablet") =>
    pairingCodeResponseSchema.parse(
      (await owner("POST", "/api/owner/devices", { label, isStation: false })).json(),
    );
  const deactivate = (id: string) => owner("PATCH", `/api/owner/staff/${id}`, { isActive: false });

  /** A paired tablet with a signed-in staff member. */
  const signedInTablet = async (employeeId: string, pin: string) => {
    const { pairingCode } = await newDevice(`Tablet ${employeeId.slice(-4)}`);
    const tablet = browser(h);
    await tablet.call("POST", "/api/device/pair", { code: pairingCode });
    const login = await tablet.call("POST", "/api/device/login", { employeeId, pin });
    if (login.statusCode !== 204) throw new Error(`login failed: ${login.body}`);
    return tablet;
  };

  return { organizationId, outletId, owner, addStaff, newDevice, deactivate, signedInTablet };
}
