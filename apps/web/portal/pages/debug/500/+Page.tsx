export { Page, onBeforeRender };

async function onBeforeRender() {
  throw new Error("Internal Error (debug).");
}

function Page() {
  return null;
}
