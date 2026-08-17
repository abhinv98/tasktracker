export function getDisplayRole(user: {
  role?: string;
  isSuperAdmin?: boolean;
  isFreelancer?: boolean;
  isHR?: boolean;
  isAccountant?: boolean;
}): string {
  if (user.isSuperAdmin) return "Super Admin";
  if (user.isHR) return "HR";
  if (user.isAccountant) return "Accountant";
  if (user.role === "admin") return "Brand Manager";
  if (user.isFreelancer) return "Freelancer";
  return "Employee";
}
