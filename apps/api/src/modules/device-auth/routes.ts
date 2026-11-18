import {
  apiErrorSchema,
  deviceStaffResponseSchema,
  pairDeviceResponseSchema,
  pairDeviceSchema,
  permissionsFor,
  shiftSchema,
  staffLoginSchema,
  staffMeResponseSchema,
} from "@restoos/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_S,
  STAFF_COOKIE,
  type AuthedDevice,
} from "../../lib/staff-auth";
import type { ModuleDeps } from "../../module-deps";
import { rooms } from "../../socket/rooms";

// Device pairing + staff PIN sign-in (M1-T6, plan §6.3).
//   POST /api/device/pair     public: one-time code → device cookie
//   GET  /api/device/staff    paired device: who can sign in here
//   POST /api/device/login    paired device: name + PIN → staff session cookie
//   GET  /api/staff/me        signed-in staff member
//   POST /api/staff/logout    "Switch User": end the staff session, device stays paired

const errors = { 400: apiErrorSchema, 401: apiErrorSchema, 429: apiErrorSchema };

export const deviceAuthRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { staffAuth } = m;
    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: m.secureCookies,
      path: "/",
    };
    const clearStaff = (reply: FastifyReply) => reply.clearCookie(STAFF_COOKIE, cookieOpts);

    async function pairedDevice(request: FastifyRequest): Promise<AuthedDevice> {
      const device = await staffAuth.authenticateDevice(request.cookies[DEVICE_COOKIE]);
      if (!device) {
        throw new AppError(
          401,
          "DEVICE_NOT_PAIRED",
          "This device isn't paired. Ask the owner for a pairing code.",
        );
      }
      return device;
    }

    app.post(
      "/device/pair",
      {
        schema: {
          tags: ["device"],
          summary: "Pair this device with a one-time code from the owner",
          body: pairDeviceSchema,
          response: { 200: pairDeviceResponseSchema, ...errors },
        },
      },
      async (request, reply) => {
        await staffAuth.assertPairingAllowed(request.ip);
        const paired = await staffAuth.pair(request.body.code);
        if (!paired) {
          throw new AppError(
            400,
            "INVALID_PAIRING_CODE",
            "That code is wrong or has expired. Ask the owner for a new one.",
          );
        }
        void reply.setCookie(DEVICE_COOKIE, paired.cookie, {
          ...cookieOpts,
          maxAge: DEVICE_COOKIE_MAX_AGE_S,
        });
        clearStaff(reply);
        return { device: { label: paired.device.label, outletName: paired.device.outletName } };
      },
    );

    app.get(
      "/device/staff",
      {
        schema: {
          tags: ["device"],
          summary: "Staff who can sign in on this device",
          response: { 200: deviceStaffResponseSchema, ...errors },
        },
      },
      async (request) => {
        const device = await pairedDevice(request);
        return {
          device: { label: device.label, outletName: device.outletName },
          staff: await staffAuth.listStaff(device),
        };
      },
    );

    app.post(
      "/device/login",
      {
        schema: {
          tags: ["device"],
          summary: "Sign in with name + PIN (5 wrong PINs lock the device for 5 minutes)",
          body: staffLoginSchema,
          response: { 204: z.null(), ...errors },
        },
      },
      async (request, reply) => {
        const device = await pairedDevice(request);
        const { cookie, expiresAt } = await staffAuth.login(
          device,
          request.body.employeeId,
          request.body.pin,
        );
        void reply.setCookie(STAFF_COOKIE, cookie, { ...cookieOpts, expires: expiresAt });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/staff/me",
      {
        schema: {
          tags: ["device"],
          summary: "The staff member signed in on this device",
          response: { 200: staffMeResponseSchema, ...errors },
        },
      },
      async (request) => {
        const me = await staffAuth.resolve(
          request.cookies[DEVICE_COOKIE],
          request.cookies[STAFF_COOKIE],
        );
        if (!me) throw new AppError(401, "UNAUTHENTICATED", "Sign in with your PIN");
        return {
          employee: me.employee,
          outlet: { id: me.device.outletId, name: me.device.outletName },
          device: { id: me.device.id, label: me.device.label },
          permissions: permissionsFor(me.employee.role),
          sessionExpiresAt: me.session.expiresAt.toISOString(),
          shift: await staffAuth
            .currentShift(me)
            .then((s) => (s ? { id: s.id, startedAt: s.startedAt.toISOString() } : null)),
          autoStartShift: me.device.autoStartShift,
          timeZone: me.device.timeZone,
        };
      },
    );

    async function signedInStaff(request: FastifyRequest) {
      const me = await staffAuth.resolve(
        request.cookies[DEVICE_COOKIE],
        request.cookies[STAFF_COOKIE],
      );
      if (!me) throw new AppError(401, "UNAUTHENTICATED", "Sign in with your PIN");
      return me;
    }

    app.post(
      "/staff/shift/start",
      {
        schema: {
          tags: ["device"],
          summary: "Start Shift (returns the open shift if already on duty)",
          response: { 200: shiftSchema, ...errors },
        },
      },
      async (request) => {
        const shift = await staffAuth.startShift(await signedInStaff(request));
        return { id: shift.id, startedAt: shift.startedAt.toISOString() };
      },
    );

    app.post(
      "/staff/shift/end",
      {
        schema: {
          tags: ["device"],
          summary: "End Shift: close the shift and sign out of this device",
          response: { 204: z.null(), ...errors },
        },
      },
      async (request, reply) => {
        const me = await signedInStaff(request);
        await staffAuth.endShift(me, request.cookies[STAFF_COOKIE]);
        clearStaff(reply);
        // Their live connection goes too (M4-T2): the next person signs in fresh.
        m.realtime.disconnect([rooms.employee(me.device.outletId, me.employee.id)]);
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/staff/logout",
      {
        schema: {
          tags: ["device"],
          summary: "Switch user: end this staff session (the device stays paired)",
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        const me = await staffAuth.resolve(
          request.cookies[DEVICE_COOKIE],
          request.cookies[STAFF_COOKIE],
        );
        await staffAuth.logout(request.cookies[STAFF_COOKIE]);
        clearStaff(reply);
        if (me) m.realtime.disconnect([rooms.employee(me.device.outletId, me.employee.id)]);
        return reply.code(204).send(null);
      },
    );
  };
