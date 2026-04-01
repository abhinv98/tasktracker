/**
 * Creative deliverable slots (N creatives, numbered slots) apply only to designing /
 * copywriting briefs, or single-task briefs that explicitly set creativesRequired.
 */
export function briefUsesCreativeSlots(brief: {
  briefType?: string | null;
  creativesRequired?: number | null;
}): boolean {
  const bt = brief.briefType;
  if (bt === "designing" || bt === "copywriting") return true;
  if (
    bt === "single_task" &&
    brief.creativesRequired != null &&
    brief.creativesRequired >= 1
  ) {
    return true;
  }
  return false;
}

export function creativesSlotTarget(brief: {
  briefType?: string | null;
  creativesRequired?: number | null;
}): number {
  if (!briefUsesCreativeSlots(brief)) return 1;
  const cr = brief.creativesRequired;
  return Math.min(99, Math.max(1, cr ?? 1));
}
