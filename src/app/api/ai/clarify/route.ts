import { connection } from "next/server";

import { clarifyComplaint } from "@/lib/ai/clarify";

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

  const result = await clarifyComplaint(complaint);
  return Response.json(
    {
      questions: result.questions,
      source: result.source,
    },
    { status: 200 },
  );
}
