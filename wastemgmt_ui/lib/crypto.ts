/**
 * Browser-side AES-256-GCM helpers that produce tokens compatible with the
 * server's `iv:tag:ciphertext` (all hex) format. The shared key comes from
 * `NEXT_PUBLIC_PAYLOAD_ENC_KEY` and must match the API's `PAYLOAD_ENC_KEY`.
 *
 * NOTE: Anything embedded in a public Next.js env var is shipped to the browser.
 * This protects credentials from passive on-the-wire snooping (in addition to
 * TLS) but is not a substitute for HTTPS in production.
 */

const KEY_HEX = (process.env.NEXT_PUBLIC_PAYLOAD_ENC_KEY ?? "").trim();

function hasWebCrypto(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.isSecureContext && globalThis.crypto?.subtle);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

let cachedKey: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    return Promise.reject(
      new Error(
        "NEXT_PUBLIC_PAYLOAD_ENC_KEY is missing or not 64 hex chars (32 bytes)"
      )
    );
  }
  if (!cachedKey) {
    cachedKey = crypto.subtle.importKey(
      "raw",
      hexToBytes(KEY_HEX) as unknown as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }
  return cachedKey;
}

/** Encrypts a string into the `iv:tag:ciphertext` (hex) format. */
export async function encryptString(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctAndTag = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as ArrayBuffer, tagLength: 128 },
      key,
      new TextEncoder().encode(plain) as unknown as ArrayBuffer
    )
  );
  // WebCrypto appends the 16-byte auth tag to the ciphertext; split it out so
  // the wire format matches Node's iv:tag:ct convention.
  const tag = ctAndTag.slice(ctAndTag.length - 16);
  const ct = ctAndTag.slice(0, ctAndTag.length - 16);
  return `${bytesToHex(iv)}:${bytesToHex(tag)}:${bytesToHex(ct)}`;
}

export async function encryptJson(value: unknown): Promise<string> {
  return encryptString(JSON.stringify(value));
}

export const cryptoEnabled = (): boolean => KEY_HEX.length === 64 && hasWebCrypto();
