/** What each kind of brief is called, everywhere one is named. */
export const BRIEF_TYPE_LABELS: Record<string, string> = {
  developmental: "Developmental",
  designing: "Designing",
  video_editing: "Video Editing",
  production: "Production",
  copywriting: "Copywriting",
  recruitment: "Recruitment",
  content_calendar: "Content Calendar",
  single_task: "Single Task",
};

export const briefTypeLabel = (type: string) => BRIEF_TYPE_LABELS[type] ?? type;
