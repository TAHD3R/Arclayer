export const GLOBAL_ROUTE_PATHS = {
  home: "/",
  inspiration: "/inspriation",
  projects: "/projects",
  system: "/system",
} as const;

export const GLOBAL_SCENE_ROUTES = [
  { path: GLOBAL_ROUTE_PATHS.home, match: "exact" },
  { path: GLOBAL_ROUTE_PATHS.inspiration, match: "prefix" },
  { path: GLOBAL_ROUTE_PATHS.projects, match: "exact" },
  { path: GLOBAL_ROUTE_PATHS.system, match: "prefix" },
] as const;
