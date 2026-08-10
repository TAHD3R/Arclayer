import { expect, test, type Page } from "@playwright/test";

test.use({
  ignoreHTTPSErrors: true,
  colorScheme: "light",
  locale: "zh-CN",
  trace: "off",
  screenshot: "off",
  video: "off",
});

const productOrigin = process.env.LOCAL_E2E_PRODUCT_ORIGIN ?? "https://app.arclayer.localhost";
const email = process.env.LOCAL_E2E_EMAIL;
const password = process.env.LOCAL_E2E_PASSWORD;
const projectId = process.env.LOCAL_E2E_PROJECT_ID;

async function readRevision(page: Page, resolvedProjectId: string) {
  return page.evaluate(async (id) => {
    const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
      state?: { accessToken?: unknown };
    } | null;
    const accessToken = auth?.state?.accessToken;
    if (typeof accessToken !== "string" || !accessToken)
      throw new Error("LOCAL_E2E_AUTH_TOKEN_MISSING");
    const builderResponse = await fetch(`/api/v1/projects/${id}/builder`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const builder = (await builderResponse.json()).data;
    const revisionId = builder.currentSiteRevision.id as string;
    const revisionResponse = await fetch(`/api/v1/projects/${id}/builder/revisions/${revisionId}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { builder, revision: (await revisionResponse.json()).data };
  }, resolvedProjectId);
}

async function login(page: Page) {
  await page.goto(new URL("/login/", productOrigin).toString());
  await page.getByRole("button", { name: "使用邮箱登录", exact: true }).click();
  await page.getByLabel("电子邮箱", { exact: true }).fill(email!);
  await page.getByLabel("密码", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(`${productOrigin}/`);
}

async function clearDraftCheckpoint(
  page: Page,
  resolvedProjectId: string,
  clientSessionId: string,
) {
  const result = await page.evaluate(
    async ({ id, sessionId }) => {
      const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
        state?: { accessToken?: string };
      } | null;
      const accessToken = auth?.state?.accessToken;
      if (typeof accessToken !== "string" || !accessToken) {
        throw new Error("LOCAL_E2E_AUTH_TOKEN_MISSING");
      }
      const csrfToken = document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith("csrf_token="))
        ?.split("=")[1];
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      };
      const query = new URLSearchParams({ client_session_id: sessionId });
      const current = await fetch(`/api/v1/projects/${id}/builder/draft-checkpoint?${query}`, {
        credentials: "include",
        headers,
      });
      if (!current.ok) {
        throw new Error(`LOCAL_E2E_CHECKPOINT_READ_${current.status}`);
      }
      const checkpoint = (await current.json()).data as
        | { checkpointVersion: number; clientSessionId: string }
        | null
        | undefined;
      if (!checkpoint) return { status: 204 };
      const discardQuery = new URLSearchParams({
        client_session_id: checkpoint.clientSessionId,
        expected_checkpoint_version: String(checkpoint.checkpointVersion),
      });
      const discarded = await fetch(
        `/api/v1/projects/${id}/builder/draft-checkpoint?${discardQuery}`,
        { method: "DELETE", credentials: "include", headers },
      );
      return { status: discarded.status };
    },
    { id: resolvedProjectId, sessionId: clientSessionId },
  );
  expect([200, 204]).toContain(result.status);
}

test("阶段4真实链路：新增页面 → Sitemap 拖拽排序 → 服务端预览/应用 → 刷新恢复", async ({
  page,
}) => {
  test.skip(
    !email || !password || !projectId,
    "LOCAL_E2E_EMAIL, LOCAL_E2E_PASSWORD and LOCAL_E2E_PROJECT_ID are required",
  );
  await login(page);
  await clearDraftCheckpoint(page, projectId!, "project-editor");
  let draftCheckpointPutCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/draft-checkpoint") && request.method() === "PUT") {
      draftCheckpointPutCount += 1;
    }
  });
  await page.goto(`${productOrigin}/projects/${projectId}/editor?stage=sitemap`);
  await expect(page.getByTestId("creation-editor")).toBeVisible({ timeout: 30_000 });
  const scenarioId = Date.now().toString(36);
  const pageATitle = `阶段4浏览器页面 A ${scenarioId}`;
  const pageBTitle = `阶段4浏览器页面 B ${scenarioId}`;

  for (const [title, path] of [
    [pageATitle, `/stage4-${scenarioId}-a`],
    [pageBTitle, `/stage4-${scenarioId}-b`],
  ] as const) {
    await page.getByRole("button", { name: "新增页面", exact: true }).click();
    await page.getByLabel("页面标题", { exact: true }).fill(title);
    await page.getByLabel("访问路径", { exact: true }).fill(path);
    await page.getByRole("button", { name: "检查页面调整", exact: true }).click();
    await expect(page.getByText("页面调整已准备好检查", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => draftCheckpointPutCount).toBeGreaterThan(0);
    await page.getByRole("button", { name: "创建页面", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId("creation-editor")).toBeVisible({ timeout: 30_000 });
  }

  const first = page.getByRole("button", { name: pageATitle, exact: false }).first();
  const second = page.getByRole("button", { name: pageBTitle, exact: false }).first();
  const beforeReorder = await readRevision(page, projectId!);
  await page.getByRole("region", { name: "页面调整检查" }).waitFor({ state: "hidden" });
  await expect(page.getByRole("application", { name: "站点地图无边画布" })).toBeVisible();
  await page.getByRole("button", { name: "适应画布", exact: true }).click();
  await first.dragTo(second, {
    sourcePosition: { x: 24, y: 24 },
    targetPosition: { x: 24, y: 24 },
  });
  await expect(page.getByRole("region", { name: "页面调整检查" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "应用到新版本", exact: true }).click();
  await expect(page.getByRole("region", { name: "页面调整检查" })).toBeHidden({
    timeout: 30_000,
  });

  const canonical = await readRevision(page, projectId!);
  const canonicalTitles = canonical.revision.pages.map((item: { title: string }) => item.title);
  const pageAIndex = canonicalTitles.indexOf(pageATitle);
  const pageBIndex = canonicalTitles.indexOf(pageBTitle);
  expect(pageAIndex).toBeGreaterThan(-1);
  expect(pageBIndex).toBeGreaterThan(-1);
  expect(pageBIndex).toBeLessThan(pageAIndex);
  expect(canonical.builder.currentSiteRevision.id).not.toBe(
    beforeReorder.builder.currentSiteRevision.id,
  );
  expect(canonical.builder.currentSiteRevision.id).toBe(canonical.revision.siteRevision.id);
  await page.reload();
  await expect(page.getByRole("button", { name: pageATitle, exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: pageBTitle, exact: false }).first()).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("已保存");
});

test("阶段4真实链路：草稿恢复 → Undo/Redo → 双上下文草稿冲突", async ({ browser }) => {
  test.skip(
    !email || !password || !projectId,
    "LOCAL_E2E_EMAIL, LOCAL_E2E_PASSWORD and LOCAL_E2E_PROJECT_ID are required",
  );
  const contextA = await browser.newContext({ ignoreHTTPSErrors: true, locale: "zh-CN" });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true, locale: "zh-CN" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await login(pageA);
    await login(pageB);
    await clearDraftCheckpoint(pageA, projectId!, "phase4-two-context");
    await pageA.goto(`${productOrigin}/projects/${projectId}/editor?stage=sitemap`);
    await pageB.goto(`${productOrigin}/projects/${projectId}/editor?stage=sitemap`);
    await expect(pageA.getByTestId("creation-editor")).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByTestId("creation-editor")).toBeVisible({ timeout: 30_000 });

    const recoveryId = Date.now().toString(36);
    let recoveryCheckpointPutCount = 0;
    pageA.on("request", (request) => {
      if (request.url().includes("/draft-checkpoint") && request.method() === "PUT") {
        recoveryCheckpointPutCount += 1;
      }
    });
    await pageA.getByRole("button", { name: "新增页面", exact: true }).click();
    await pageA.getByLabel("页面标题", { exact: true }).fill(`阶段4恢复草稿 ${recoveryId}`);
    await pageA.getByLabel("访问路径", { exact: true }).fill(`/stage4-recovery-${recoveryId}`);
    await pageA.getByRole("button", { name: "检查页面调整", exact: true }).click();
    await expect(pageA.getByText("页面调整已准备好检查", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => recoveryCheckpointPutCount).toBeGreaterThan(0);
    await pageA.reload();
    await expect(pageA.getByTestId("creation-editor")).toBeVisible({ timeout: 30_000 });
    await expect(pageA.getByRole("region", { name: "页面调整检查" })).toBeVisible({
      timeout: 30_000,
    });
    await pageA.getByRole("button", { name: "放弃候选", exact: true }).click();
    await clearDraftCheckpoint(pageA, projectId!, "project-editor");
    await pageA.reload();
    await expect(pageA.getByTestId("creation-editor")).toBeVisible({ timeout: 30_000 });

    const undo = pageA.getByRole("button", { name: "撤销", exact: true });
    await expect(undo).toBeEnabled({ timeout: 30_000 });
    await undo.click();
    await expect(pageA.getByRole("region", { name: "页面调整检查" })).toBeVisible({
      timeout: 30_000,
    });
    await pageA.getByRole("button", { name: "应用到新版本", exact: true }).click();
    await expect(pageA.getByRole("region", { name: "页面调整检查" })).toBeHidden({
      timeout: 30_000,
    });
    await pageA.reload();
    await expect(pageA.getByTestId("creation-editor")).toBeVisible({ timeout: 30_000 });

    const redo = pageA.getByRole("button", { name: "重做", exact: true });
    await expect(redo).toBeEnabled({ timeout: 30_000 });
    await redo.click();
    await expect(pageA.getByRole("region", { name: "页面调整检查" })).toBeVisible({
      timeout: 30_000,
    });
    await pageA.getByRole("button", { name: "应用到新版本", exact: true }).click();
    await expect(pageA.getByRole("region", { name: "页面调整检查" })).toBeHidden({
      timeout: 30_000,
    });

    const base = await readRevision(pageA, projectId!);
    const page = base.revision.pages[0];
    if (!page) throw new Error("LOCAL_E2E_PAGE_REQUIRED");
    const operation = {
      type: "page.intent.replace",
      operationId: `phase4-conflict-${Date.now()}`,
      itemId: page.itemId,
      purpose: page.purpose ?? "阶段4冲突验证",
      sectionIntents: page.sectionIntents ?? [],
    };
    const payload = {
      baseRevisionId: base.revision.siteRevision.id,
      baseEtag: base.revision.siteRevision.manifestHash,
      expectedCheckpointVersion: 0,
      clientSessionId: "phase4-two-context",
      operations: [operation],
      provenanceSource: "human",
    };
    const saveCheckpoint = (targetPage: Page) =>
      targetPage.evaluate(
        async ({ id, body }) => {
          const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
            state?: { accessToken?: string };
          } | null;
          const response = await fetch(`/api/v1/projects/${id}/builder/draft-checkpoint`, {
            method: "PUT",
            credentials: "include",
            headers: {
              Authorization: `Bearer ${auth?.state?.accessToken ?? ""}`,
              "Content-Type": "application/json",
              "X-CSRF-Token":
                document.cookie
                  .split("; ")
                  .find((cookie) => cookie.startsWith("csrf_token="))
                  ?.split("=")[1] ?? "",
              "Idempotency-Key": `phase4-checkpoint-${crypto.randomUUID()}`,
            },
            body: JSON.stringify(body),
          });
          return { status: response.status, body: await response.json() };
        },
        { id: projectId, body: payload },
      );
    expect((await saveCheckpoint(pageA)).status).toBe(200);
    expect((await saveCheckpoint(pageB)).status).toBe(409);
    const discard = await pageA.evaluate(async (id) => {
      const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
        state?: { accessToken?: string };
      } | null;
      const response = await fetch(
        `/api/v1/projects/${id}/builder/draft-checkpoint?client_session_id=phase4-two-context&expected_checkpoint_version=1`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${auth?.state?.accessToken ?? ""}`,
            "X-CSRF-Token":
              document.cookie
                .split("; ")
                .find((cookie) => cookie.startsWith("csrf_token="))
                ?.split("=")[1] ?? "",
          },
        },
      );
      return response.status;
    }, projectId);
    expect(discard).toBe(200);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
