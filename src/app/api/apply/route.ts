import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { r2Client, R2_BUCKET } from "@/lib/r2";
import { api } from "@/convex/_generated/api";

/**
 * The job application form on ecultify.com/job-application.
 *   GET  /api/apply  -> [{ id, label }] the roles that are open
 *   POST /api/apply  -> multipart form; stores the resume in R2 and files the
 *                       application (recruitment.apply checks every field).
 * Public: there is no login on a job form.
 */

const SITES = ["https://ecultify.com", "https://www.ecultify.com"];
const MAX_RESUME = 10 * 1024 * 1024;

function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return SITES.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
}

const json = (req: NextRequest, body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: cors(req) });

const convex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: { ...cors(req), "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Max-Age": "86400" },
  });
}

export async function GET(req: NextRequest) {
  try {
    return json(req, await convex().query(api.recruitment.openPositions, {}));
  } catch (err) {
    console.error("apply: positions failed", err);
    return json(req, { error: "Could not load positions" }, 500);
  }
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Could not read the form. Please try again." }, 400);
  }
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  // A field people never see. Only a bot fills it in, and it gets a polite yes.
  if (text("website")) return json(req, { success: true });

  const jobSourceId = Number(text("selected_job_id") || text("job_id"));
  if (!Number.isInteger(jobSourceId) || jobSourceId <= 0) return json(req, { error: "Please select a role" }, 400);
  if (!text("name")) return json(req, { error: "Please enter your name" }, 400);

  let resumeKey: string | undefined;
  const resume = form.get("resume");
  if (resume instanceof File && resume.size > 0) {
    if (resume.size > MAX_RESUME) {
      return json(req, { error: "Resume is larger than 10 MB. Please attach a smaller PDF." }, 413);
    }
    const bytes = Buffer.from(await resume.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return json(req, { error: "Please upload your resume as a PDF." }, 422);
    }
    const base = resume.name.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "resume";
    resumeKey = `resumes/${crypto.randomUUID()}/${base}.pdf`;
    try {
      await r2Client.send(
        new PutObjectCommand({ Bucket: R2_BUCKET, Key: resumeKey, Body: bytes, ContentType: "application/pdf" })
      );
    } catch (err) {
      console.error("apply: resume upload failed", err);
      return json(req, { error: "Resume upload failed. Please try again." }, 502);
    }
  }

  // A resume nothing points at (a rejected or repeated submission) is removed.
  const dropResume = async () => {
    if (!resumeKey) return;
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: resumeKey })).catch(() => {});
  };

  const age = parseInt(text("age"), 10);
  try {
    const result = await convex().mutation(api.recruitment.apply, {
      jobSourceId,
      name: text("name"),
      email: text("email"),
      number: text("number"),
      age: Number.isNaN(age) ? null : age,
      experience: text("experience"),
      currentCtc: text("current_ctc"),
      expectedCtc: text("expected_ctc"),
      noticePeriod: text("notice_period"),
      portfolioLink: text("portfolio_link"),
      resumeKey,
    });
    if (!result.saved) await dropResume();
    return json(req, { success: true });
  } catch (err) {
    await dropResume();
    if (err instanceof ConvexError) return json(req, { error: String(err.data) }, 400);
    console.error("apply: save failed", err);
    return json(req, { error: "Something went wrong. Please try again." }, 500);
  }
}
