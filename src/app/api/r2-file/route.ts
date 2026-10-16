import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET } from "@/lib/r2";

/**
 * GET /api/r2-file?key=deliverables/123-abc/file.png
 * Returns a 302 redirect to a presigned GET URL (valid 1 hour).
 * This lets us serve R2 files without making the bucket public.
 */
export async function GET(req: NextRequest) {
  const fileKey = req.nextUrl.searchParams.get("key");
  if (!fileKey) {
    return NextResponse.json({ error: "key parameter required" }, { status: 400 });
  }
  // Only sign keys our upload route creates; anything else in the bucket stays private.
  // No session check: client-portal and intake viewers open these links without logging in.
  if (!fileKey.startsWith("deliverables/")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: fileKey,
    });

    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

    return NextResponse.redirect(signedUrl, 302);
  } catch (err) {
    console.error("R2 file presign error:", err);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }
}
