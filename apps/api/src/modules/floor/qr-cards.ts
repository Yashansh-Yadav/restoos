import {
  Document,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { BRAND } from "@restoos/shared";
import QRCode from "qrcode";
import { createElement as h } from "react";
import type { QrCard } from "./service";

// Printable table cards (M3-T2): A4 portrait, 2 × 3 cards per page with dashed cut lines.
// The QR is drawn as one vector path (sharp at any print size), error correction M, pointing at
// {APP_URL}/t/{qrToken}. English only for now: react-pdf can't shape Devanagari reliably, and the
// i18n helper isn't in yet (plan §17). Built with createElement so the API needs no JSX setup.

export const CARDS_PER_PAGE = 6;
const QR_SIZE = 150; // pt ≈ 53 mm

const styles = StyleSheet.create({
  page: { padding: 24, flexDirection: "row", flexWrap: "wrap", fontFamily: "Helvetica" },
  card: {
    width: "50%",
    height: "33.33%",
    borderWidth: 0.75,
    borderStyle: "dashed",
    borderColor: "#b0b0b0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  outlet: { fontSize: 11, color: "#222222" },
  label: { fontSize: 36, fontFamily: "Helvetica-Bold", color: "#222222", marginTop: 2 },
  scan: { fontSize: 11, color: "#222222", marginTop: 6 },
  footer: { fontSize: 7, color: "#6a6a6a", marginTop: 4 },
});

const oneLine = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export const customerUrl = (appUrl: string, qrToken: string) =>
  `${appUrl}/t/${encodeURIComponent(qrToken)}`;

/** SVG path of the dark modules (4-module quiet zone included in the viewBox). */
export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    }
  }
  return { size: n + 8, d };
}

function card(c: QrCard & { outletName: string }, appUrl: string, host: string, key: number) {
  const { size, d } = qrPath(customerUrl(appUrl, c.qrToken));
  return h(
    View,
    { key, style: styles.card, wrap: false },
    h(Text, { style: styles.outlet }, oneLine(c.outletName, 40)),
    h(Text, { style: styles.label }, c.label),
    h(
      Svg,
      { width: QR_SIZE, height: QR_SIZE, viewBox: `0 0 ${size} ${size}` },
      h(Path, { d, fill: "#000000" }),
    ),
    h(Text, { style: styles.scan }, "Scan to view menu & call staff"),
    h(Text, { style: styles.footer }, `${host} · Powered by ${BRAND.name}`),
  );
}

export async function buildQrCardsPdf({
  outletName,
  appUrl,
  cards,
}: {
  outletName: string;
  appUrl: string;
  cards: QrCard[];
}): Promise<Buffer> {
  if (cards.length === 0) throw new Error("No cards to print");
  const host = new URL(appUrl).host;
  const pages: QrCard[][] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
    pages.push(cards.slice(i, i + CARDS_PER_PAGE));
  }
  const doc = h(
    Document,
    { title: `${outletName} — table QR codes`, author: BRAND.name },
    pages.map((items, p) =>
      h(
        Page,
        { key: p, size: "A4", style: styles.page },
        items.map((c, i) => card({ ...c, outletName }, appUrl, host, i)),
      ),
    ),
  );
  return renderToBuffer(doc);
}
