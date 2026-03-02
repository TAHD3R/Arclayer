import { render } from "vike/abort";

export { Page, onBeforeRender };

async function onBeforeRender() {
  throw render(403, "Forbidden (debug).");
}

function Page() {
  return null;
}
