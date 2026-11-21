import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillLetterXml, letterValues } from "@/lib/appointmentLetter";

/**
 * POST /api/appointment-letter  { offerId }
 * Returns the appointment letter for that offer as a Word file, filled from the
 * offer's own fields. The caller's Convex login token is in the Authorization
 * header, and the offer is read as that person: someone who cannot open the
 * offer in Recruitment cannot get its letter here either.
 */
export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const { offerId } = (await req.json().catch(() => ({}))) as { offerId?: unknown };
  if (!jwt || typeof offerId !== "string") return NextResponse.json({ error: "Sign in to do this" }, { status: 401 });

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(jwt);
  let letter;
  try {
    letter = await convex.query(api.hrOps.letterData, { offerId: offerId as Id<"hrRecords"> });
  } catch {
    letter = null; // an expired login, or an id that is not an offer
  }
  if (!letter) return NextResponse.json({ error: "That offer is not available to you" }, { status: 404 });
  const { data } = letter;
  if (letter.missing.length > 0 || !data.confirmedLpa) {
    return NextResponse.json({ error: `Fill these on the offer first: ${letter.missing.join(", ")}` }, { status: 422 });
  }

  const template = await readFile(path.join(process.cwd(), "src/assets/appointment-letter-template.docx"));
  const files = unzipSync(new Uint8Array(template));
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10); // the date in India
  files["word/document.xml"] = strToU8(
    fillLetterXml(strFromU8(files["word/document.xml"]), letterValues({ ...data, confirmedLpa: data.confirmedLpa, letterDate: today }))
  );
  const name = `Appointment Letter - ${data.name.replace(/[^A-Za-z0-9 ._-]/g, "").trim() || letter.code}.docx`;
  return new NextResponse(Buffer.from(zipSync(files)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
