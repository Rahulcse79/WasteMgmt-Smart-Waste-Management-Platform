import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/chat
 * Proxies messages to Anthropic claude-sonnet-4-20250514.
 * The API key is read from ANTHROPIC_API_KEY env var (server-only, not NEXT_PUBLIC_).
 *
 * Request body: { messages: { role: "user" | "assistant"; content: string }[] }
 * Response: { content: string }
 */

const SYSTEM_PROMPT = `You are Coral AI, the intelligent operations assistant for the Coral Telecom Smart Waste Management Platform.

You have full knowledge of the platform's capabilities:
- Real-time IoT dustbin telemetry via MQTT: depth (fill level %), gas (ppm), humidity (%), temperature (°C)
- Predictive overflow ETA using ML regression on historical fill rates
- TSP-based route optimisation for waste-collection vehicles
- Citizen report intake and triage
- Role-scoped access (admin / user / driver)
- Alert rules engine (threshold-based triggers)
- Audit log and CSV data export
- WebSocket live dashboard for operators

When answering:
- Be concise, factual, and operator-focused.
- If asked about a specific bin (e.g. RGGP-01), explain that you can describe general status but live values come from the dashboard.
- For route optimisation questions, explain the TSP algorithm used and how to trigger a recalculation.
- For overflow alerts, explain thresholds and how to configure rules.
- For reports, explain CSV export and analytics pages.
- Always recommend escalation to field ops for physical interventions.
- Respond in the same language as the user (English default).`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured. Set ANTHROPIC_API_KEY in environment." },
      { status: 503 },
    );
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  // Validate message structure
  for (const m of messages) {
    if (typeof m.role !== "string" || typeof m.content !== "string") {
      return NextResponse.json({ error: "Each message must have role and content strings" }, { status: 400 });
    }
    if (m.role !== "user" && m.role !== "assistant") {
      return NextResponse.json({ error: "Message role must be 'user' or 'assistant'" }, { status: 400 });
    }
  }

  // Forward to Anthropic Messages API
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error("Anthropic API error:", anthropicRes.status, errText);
    return NextResponse.json({ error: "AI service error" }, { status: 502 });
  }

  const data = (await anthropicRes.json()) as {
    content: { type: string; text: string }[];
  };

  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return NextResponse.json({ content: text });
}
