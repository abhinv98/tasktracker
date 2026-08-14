import {
  LayoutGrid,
  ListTodo,
  Briefcase,
  BarChart3,
  Tag,
  MessageCircle,
  MessageSquare,
  CalendarRange,
  FileCheck,
  ClipboardList,
  Users,
  UserCog,
  Archive,
  NotebookPen,
  UserCircle,
  Inbox,
  LifeBuoy,
  Send,
  UserSearch,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

type CommandUser = {
  role?: string;
  isSuperAdmin?: boolean;
  isHR?: boolean;
};

export interface NavCommand {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Extra search terms — lowercase. Lets "people" find Users & Teams. */
  keywords: string[];
  hint?: string;
  visible: (user: CommandUser) => boolean;
}

const isAdmin = (u: CommandUser) => (u.role ?? "employee") === "admin";
const isEmployee = (u: CommandUser) => (u.role ?? "employee") !== "admin";
const isHR = (u: CommandUser) => u.isHR === true;
// HR's view is deliberately stripped of brand work — mirror the route guard in
// (dashboard)/layout.tsx so the palette can't offer a page that bounces them.
const adminNotHR = (u: CommandUser) => isAdmin(u) && !isHR(u);

export const NAV_COMMANDS: NavCommand[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutGrid,
    keywords: ["home", "overview", "queue", "today"],
    visible: () => true,
  },
  {
    label: "My Tasks",
    href: "/my-tasks",
    icon: ListTodo,
    keywords: ["todo", "assigned", "mine"],
    visible: isAdmin,
  },
  {
    label: "Briefs",
    href: "/briefs",
    icon: Briefcase,
    keywords: ["campaign", "projects", "work"],
    visible: isAdmin,
  },
  {
    label: "My Requests",
    href: "/my-requests",
    icon: Send,
    keywords: ["hr", "appraisal", "letter", "reimbursement", "comp off"],
    hint: "Ask HR",
    visible: (u) => !isHR(u),
  },
  {
    label: "Requests",
    href: "/hr-requests",
    icon: LifeBuoy,
    keywords: ["hr", "appraisal", "staff", "triage"],
    hint: "HR inbox",
    visible: isHR,
  },
  {
    label: "Recruitment",
    href: "/recruitment",
    icon: UserSearch,
    keywords: ["hiring", "candidates", "applicants", "jobs", "cv", "resume"],
    hint: "Candidates",
    visible: (u) => isHR(u) || u.isSuperAdmin === true,
  },
  {
    label: "All Candidates",
    href: "/recruitment/candidates",
    icon: UserSearch,
    keywords: ["cv", "resume", "applicants", "talent", "pool", "search"],
    hint: "Recruitment",
    visible: (u) => isHR(u) || u.isSuperAdmin === true,
  },
  {
    label: "Campaigns",
    href: "/recruitment/campaigns",
    icon: UserSearch,
    keywords: ["outreach", "batch", "mail", "recruitment"],
    hint: "Recruitment",
    visible: (u) => isHR(u) || u.isSuperAdmin === true,
  },
  {
    label: "History",
    href: "/history",
    icon: BookOpen,
    keywords: ["past", "completed", "archive"],
    visible: isEmployee,
  },
  {
    label: "Content Calendar",
    href: "/content-calendar",
    icon: CalendarRange,
    keywords: ["schedule", "posts", "social", "planner"],
    visible: (u) => !isHR(u),
  },
  {
    label: "Brands Overview",
    href: "/brands-overview",
    icon: BarChart3,
    keywords: ["clients", "accounts"],
    visible: adminNotHR,
  },
  {
    label: "Brands",
    href: "/my-brands",
    icon: Tag,
    keywords: ["clients", "accounts"],
    visible: isEmployee,
  },
  {
    label: "Client Requests",
    href: "/client-requests",
    icon: Inbox,
    keywords: ["intake", "jsr", "incoming"],
    visible: adminNotHR,
  },
  {
    label: "Deliverables",
    href: "/deliverables",
    icon: FileCheck,
    keywords: ["approvals", "review", "submissions"],
    visible: () => true,
  },
  {
    label: "Work Log",
    href: "/worklog",
    icon: ClipboardList,
    keywords: ["oversight", "activity", "timesheet"],
    visible: isAdmin,
  },
  {
    label: "Users & Teams",
    href: "/users",
    icon: Users,
    keywords: ["people", "staff", "roles", "invite"],
    visible: isAdmin,
  },
  {
    label: "Freelancers",
    href: "/freelancers",
    icon: UserCog,
    keywords: ["contractors", "external"],
    visible: isAdmin,
  },
  {
    label: "Discussions",
    href: "/discussions",
    icon: MessageCircle,
    keywords: ["comments", "threads"],
    visible: (u) => !isHR(u),
  },
  {
    label: "Messages",
    href: "/messages",
    icon: MessageSquare,
    keywords: ["dm", "chat", "inbox"],
    visible: (u) => !isHR(u),
  },
  {
    label: "Archive",
    href: "/archive",
    icon: Archive,
    keywords: ["old", "closed"],
    visible: (u) => isAdmin(u) && !isHR(u),
  },
  {
    label: "My Notebook",
    href: "/notebook",
    icon: NotebookPen,
    keywords: ["notes", "personal", "scratch"],
    visible: isAdmin,
  },
  {
    label: "Profile",
    href: "/profile",
    icon: UserCircle,
    keywords: ["account", "settings", "password", "avatar"],
    visible: () => true,
  },
];
