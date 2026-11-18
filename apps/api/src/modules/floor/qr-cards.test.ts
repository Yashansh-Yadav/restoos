import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { buildQrCardsPdf, customerUrl, qrPath } from "./qr-cards";

const card = (n: number) => ({ label: `T${n}`, section: "Main Hall", qrToken: `tok_${n}-abc` });
const pageCount = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;

describe("QR table cards (M3-T2)", () => {
  it("prints 6 cards per A4 page", async () => {
    const pdf = await buildQrCardsPdf({
      outletName: "Saffron Table",
      appUrl: "https://app.example.in",
      cards: Array.from({ length: 7 }, (_, i) => card(i + 1)),
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(2);
  });

  it("refuses an empty sheet", async () => {
    await expect(
      buildQrCardsPdf({ outletName: "X", appUrl: "https://app.example.in", cards: [] }),
    ).rejects.toThrow();
  });

  it("encodes the customer link for the table", () => {
    const url = customerUrl("https://app.example.in", "tok_1-abc");
    expect(url).toBe("https://app.example.in/t/tok_1-abc");
    const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
    const text = qr.segments
      .map((s) => ("data" in s ? Buffer.from(s.data as Uint8Array).toString() : ""))
      .join("");
    expect(text).toBe(url);
    const { size, d } = qrPath(url);
    expect(size).toBe(qr.modules.size + 8);
    // One square per dark module.
    expect(d.split("M").length - 1).toBe([...qr.modules.data].filter(Boolean).length);
  });
});
