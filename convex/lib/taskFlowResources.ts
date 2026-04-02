import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Merge upstream task reference links + deliverable links/files into the downstream task
 * so flow connections pass work product to the next step.
 */
export async function mergeUpstreamResourcesIntoTask(
  ctx: MutationCtx,
  targetTaskId: Id<"tasks">,
  sourceTaskId: Id<"tasks">
) {
  const source = await ctx.db.get(sourceTaskId);
  const target = await ctx.db.get(targetTaskId);
  if (!source || !target) return;
  if (source.briefId !== target.briefId) return;

  const urls: string[] = [];
  if (source.referenceLinks?.length) urls.push(...source.referenceLinks);

  const deliverables = await ctx.db
    .query("deliverables")
    .withIndex("by_task", (q) => q.eq("taskId", sourceTaskId))
    .collect();

  for (const d of deliverables) {
    if (d.status === "rejected") continue;
    if (d.link) urls.push(d.link);
    if (d.fileIds?.length) {
      for (const fid of d.fileIds) {
        const url = await ctx.storage.getUrl(fid);
        if (url) urls.push(url);
      }
    }
  }

  const uniq = [...new Set(urls.filter(Boolean))];
  const existing = target.referenceLinks ?? [];
  const merged = [...new Set([...existing, ...uniq])];
  if (merged.length > existing.length) {
    await ctx.db.patch(targetTaskId, { referenceLinks: merged });
  }
}
