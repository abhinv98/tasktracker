export function getDisplayRole(user: {
  role?: string;
  isSuperAdmin?: boolean;
  isFreelancer?: boolean;
}): string {
  if (user.isSuperAdmin) return "Super Admin";
  if (user.role === "admin") return "Brand Manager";
  if (user.isFreelancer) return "Freelancer";
  return "Employee";
}
