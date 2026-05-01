/**
 * /api/certs — List and upload TLS/IoT MQTT certificates.
 * Files are stored in /etc/iotmqttcerts/ (created automatically).
 *
 * GET  → returns JSON array of { name, size, mtime }
 * POST → multipart form upload, saves files to the certs dir
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CERTS_DIR = "/etc/iotmqttcerts";
const ALLOWED_EXT = new Set([".crt", ".key", ".pem", ".ca"]);

function ensureDir(): void {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true, mode: 0o750 });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    ensureDir();
    const entries = fs.readdirSync(CERTS_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const stat = fs.statSync(path.join(CERTS_DIR, e.name));
        return { name: e.name, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(files);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    ensureDir();
    const form = await req.formData();
    const files = form.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploaded: string[] = [];
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json(
          { error: `File type not allowed: ${file.name}. Allowed: .crt .key .pem .ca` },
          { status: 400 }
        );
      }
      // Sanitise filename — strip path components, allow only safe characters
      const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
      const dest = path.join(CERTS_DIR, safeName);
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(dest, buf, { mode: 0o640 });
      uploaded.push(safeName);
    }

    return NextResponse.json({ uploaded });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
