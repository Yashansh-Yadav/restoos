// M2-T1: local file storage, the menu photo pipeline, and the event bus.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createEventBus } from "./events";
import { processMenuImage } from "./images";
import { createLocalDiskStorage, keyFromPublicUrl } from "./storage";
import type { TenantContext } from "./tenant";

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("local disk storage", () => {
  it("puts, reads and deletes files by key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "restoos-storage-"));
    dirs.push(dir);
    const s = createLocalDiskStorage(dir);
    await s.put("menu/o1/item-abc.webp", Buffer.from("hello"), "image/webp");
    expect(s.publicUrl("menu/o1/item-abc.webp")).toBe("/api/files/menu/o1/item-abc.webp");
    expect(await s.read("menu/o1/item-abc.webp")).toEqual({
      bytes: Buffer.from("hello"),
      contentType: "image/webp",
    });
    await s.delete("menu/o1/item-abc.webp");
    expect(await s.read("menu/o1/item-abc.webp")).toBeNull();
  });

  it("refuses keys that could escape the storage folder", async () => {
    const s = createLocalDiskStorage(await mkdtemp(join(tmpdir(), "restoos-storage-")));
    await expect(s.put("../evil.webp", Buffer.from("x"), "image/webp")).rejects.toThrow();
    await expect(s.put("/etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow();
    expect(await s.read("../../package.json")).toBeNull();
    expect(keyFromPublicUrl("/api/files/menu/../x.webp")).toBeNull();
    expect(keyFromPublicUrl("https://evil.example/x.webp")).toBeNull();
    expect(keyFromPublicUrl("/api/files/menu/o1/a.webp")).toBe("menu/o1/a.webp");
  });
});

describe("menu photo pipeline", () => {
  it("turns a large PNG into a WebP that fits in 800×800, without metadata", async () => {
    const png = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "#c8361a" },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "secret" } } })
      .png()
      .toBuffer();
    const out = await processMenuImage(png);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(400);
    expect(meta.exif).toBeUndefined();
  });

  it("rejects things that aren't photos", async () => {
    await expect(processMenuImage(Buffer.from("not an image"))).rejects.toMatchObject({
      code: "IMAGE_TYPE",
    });
    const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    await expect(processMenuImage(gif)).rejects.toMatchObject({ code: "IMAGE_TYPE" });
  });

  it("answers 400, not 500, for a photo whose header is fine but data is corrupt", async () => {
    // A 2×2 PNG with a valid header but a broken data chunk (found by the M2-T1 E2E test).
    const corrupt = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwnwEI/v9nYGBgAAAAQAH+gqKlmgAAAABJRU5ErkJggg==",
      "base64",
    );
    expect((await sharp(corrupt).metadata()).format).toBe("png"); // passes the type check
    await expect(processMenuImage(corrupt)).rejects.toMatchObject({
      statusCode: 400,
      code: "IMAGE_UNREADABLE",
    });
  });
});

describe("event bus", () => {
  const ctx: TenantContext = { organizationId: "o", actor: { kind: "system", reason: "test" } };

  it("delivers typed events to listeners and survives a failing one", async () => {
    const onError = vi.fn();
    const bus = createEventBus(onError);
    const seen: unknown[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    const off = bus.subscribe((_ctx, e) => {
      seen.push(e);
    });
    await bus.publishEvent(ctx, "menu.stockChanged", {
      outletId: "x",
      itemId: "i",
      inStock: false,
    });
    off();
    await bus.publishEvent(ctx, "menu.changed", { outletId: "x" });
    await Promise.resolve();
    expect(seen).toEqual([
      { name: "menu.stockChanged", payload: { outletId: "x", itemId: "i", inStock: false } },
    ]);
    // The failing listener stays subscribed: both publishes report it, neither throws.
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
