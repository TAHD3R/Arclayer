export function canRenderAdminCenterNav(role: string | null): boolean {
  return role === "owner" || role === "admin";
}
