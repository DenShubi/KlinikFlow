import { connection } from "next/server";

import { clarifyComplaint } from "@/lib/ai/clarify";
import { getLocale } from "@/lib/i18n/server";

export async function POST(request: Request) {
  await connection();

  let complaint = "";
  try {
    const body = (await request.json()) as { complaint?: unknown };
    if (typeof body?.complaint === "string") {
      complaint = body.complaint.trim().slice(0, 300);
    }
  } catch {
    return Response.json({ questions: [], source: "fallback" }, { status: 400 });
  }

  if (complaint.length < 3) {
    return Response.json({ questions: [], source: "fallback" }, { status: 200 });
  }

  // Questions in the language the patient chose (cookie set by the language switch).
  const result = await clarifyComplaint(complaint, await getLocale());
  return Response.json(
    {
      questions: result.questions,
      source: result.source,
    },
    { status: 200 },
  );
}
