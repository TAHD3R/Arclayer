export const STORAGE_KEYS = {
  // Studio 与 Admin 使用相同的 key 命名规则，便于未来把偏好持久化迁移到共享存储（例如 server-side 或 cookie）。
  locale: "celestial:admin:locale",
  themeMode: "celestial:admin:theme",
  auth: "celestial:admin:auth",
  // Studio 仍可拥有独立偏好（例如最近工作区），避免与 Admin 混淆。
  lastWorkspaceId: "celestial:studio:lastWorkspaceId",
} as const;
