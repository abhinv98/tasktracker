import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConvexHttpClient } from "convex/browser";
import { r2Client, R2_BUCKET } from "@/lib/r2";
import { api } from "@/convex/_generated/api";

/** Who may get an upload URL: someone signed in (staff or a portal client; the Convex login
 *  token in the Authorization header), or whoever holds an active intake link (its token in
 *  the body). Nobody else can put files in the bucket. */
async function allowed(req: NextRequest, intakeToken: unknown): Promise<boolean> {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  try {
    if (typeof intakeToken === "string" && intakeToken) {
      return (await convex.query(api.jsr.getIntakeByToken, { token: intakeToken })) !== null;
    }
    const jwt = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!jwt) return false;
    convex.setAuth(jwt);
    const me = await convex.query(api.users.getCurrentUser, {});
    return !!me && me.isReviewer !== true;
  } catch {
    return false; // a bad or expired login token
  }
}

/**
 * POST /api/r2-upload
 * Body: { fileName: string, contentType: string }
 * Returns: { uploadUrl: string, fileKey: string, publicUrl: string }
 *
 * The frontend uses the uploadUrl to PUT the file directly to R2.
 */
export async function POST(req: NextRequest) {
  try {
    const { fileName, contentType, intakeToken } = await req.json();
    if (!(await allowed(req, intakeToken))) {
      return NextResponse.json({ error: "Sign in to upload files" }, { status: 401 });
    }
    if (!fileName || !contentType) {
      return NextResponse.json({ error: "fileName and contentType required" }, { status: 400 });
    }

    // Generate a unique key: deliverables/<timestamp>-<random>/<originalFileName>
    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 10);
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileKey = `deliverables/${timestamp}-${rand}/${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: fileKey,
      ContentType: contentType,
    });

    // Presigned URL valid for 10 minutes
    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 600 });

    return NextResponse.json({
      uploadUrl,
      fileKey,
    });
  } catch (err) {
    console.error("R2 upload presign error:", err);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
