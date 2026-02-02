import type { RouteSync } from "vike/types";

// Catch-all route: Vike always renders the same React shell, while TanStack Router
// handles actual routing inside the app.
export default ((_) => true) satisfies RouteSync;
