/**
 * QR helpers used by the host console.
 *
 * Tokens are 16-char URL-safe random strings, comfortably inside the
 * sessions.qr_token min/max (8/64) and large enough that a brute force
 * over the API would hit our PB rate limits long before colliding.
 */

import QRCode from "qrcode";

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
const TOKEN_LENGTH = 16;

export function generateQrToken(
  random: () => number = Math.random,
): string {
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)];
  }
  return out;
}

export function joinUrl(token: string, origin: string): string {
  const safe = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${safe}/join/${token}`;
}

export async function qrCodeSvg(data: string): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}
