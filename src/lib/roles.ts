export function getDisplayRole(user: { role?: string; isSuperAdmin?: boolean }): string {
  if (user.isSuperAdmin) return "Super Admin";
  if (user.role === "admin") return "Brand Manager";
  return "Employee";
}
