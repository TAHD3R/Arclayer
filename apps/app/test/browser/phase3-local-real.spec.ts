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
const buildTimeout = 180_000;

type RunSnapshot = {
  status: number;
  data?: {
    status?: string;
    executionMode?: string;
    projectId?: string | null;
    siteRevisionId?: string | null;
    error?: { code?: string } | null;
  };
};

async function readRunSnapshot(
  page: Page,
  workspaceId: string,
  runId: string,
): Promise<RunSnapshot> {
  return page.evaluate(
    async ({ resolvedWorkspaceId, resolvedRunId }) => {
      const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
        state?: { accessToken?: unknown };
      } | null;
      const accessToken = auth?.state?.accessToken;
      if (typeof accessToken !== "string" || !accessToken) {
        throw new Error("LOCAL_E2E_AUTH_TOKEN_MISSING");
      }
      const response = await fetch(
        `/api/v1/workspaces/${resolvedWorkspaceId}/ai/runs/${resolvedRunId}`,
        { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const envelope = (await response.json()) as {
        data?: {
          run?: RunSnapshot["data"];
          error?: { code?: string } | null;
        };
        error?: { code?: string } | null;
      };
      const snapshot = envelope.data;
      return {
        status: response.status,
        data: snapshot?.run
          ? { ...snapshot.run, error: snapshot.error }
          : envelope.error
            ? { error: envelope.error }
            : undefined,
      };
    },
    { resolvedWorkspaceId: workspaceId, resolvedRunId: runId },
  );
}

async function waitForBuildCompletion(
  page: Page,
  workspaceId: string,
  runId: string,
): Promise<RunSnapshot> {
  const deadline = Date.now() + buildTimeout;
  let snapshot = await readRunSnapshot(page, workspaceId, runId);
  while (snapshot.data?.status === "queued" || snapshot.data?.status === "running") {
    if (Date.now() >= deadline)
      throw new Error("Build did not reach a terminal status before the timeout");
    await page.waitForTimeout(2_000);
    snapshot = await readRunSnapshot(page, workspaceId, runId);
  }
  return snapshot;
}

test("阶段3真实链路：中文 brief → Plan → Build → Builder Sitemap", async ({ page }) => {
  test.setTimeout(buildTimeout + 30_000);
  if (!email || !password) throw new Error("LOCAL_E2E_EMAIL and LOCAL_E2E_PASSWORD are required");

  const agentsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/workspaces/") && response.url().includes("/agents?"),
    { timeout: 15_000 },
  );
  await page.goto(new URL("/login/", productOrigin).toString());
  await page.getByRole("button", { name: "使用邮箱登录", exact: true }).click();
  await page.getByLabel("电子邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(`${productOrigin}/`);
  const agentsResponse = await agentsResponsePromise;
  expect(agentsResponse.status()).toBe(200);

  await page.evaluate(() => {
    const key = "arclayer:admin:workspace";
    const stored = localStorage.getItem(key);
    if (!stored) return;
    const state = JSON.parse(stored) as { state?: { lastProjectId?: string | null } };
    if (state.state) state.state.lastProjectId = null;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page).toHaveURL(`${productOrigin}/`);
  await expect(page.getByRole("textbox", { name: "询问 AI…" }).first()).toBeEditable({
    timeout: 30_000,
  });
  await page.waitForTimeout(2_000);
  const modeButton = page.getByRole("button", { name: "选择工作模式", exact: true });
  await modeButton.click({ force: true });
  await page.evaluate(async () => {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
        (candidate) => candidate.textContent?.trim().startsWith("规划"),
      );
      if (item) {
        item.click();
        return;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    throw new Error("Plan mode menu item was not rendered");
  });
  await expect(page.getByRole("button", { name: "选择工作模式", exact: true })).toContainText(
    "规划",
  );

  const composer = page.getByRole("textbox", { name: "询问 AI…" });
  await composer.fill(
    "请为品牌名为海派烘焙的上海精品咖啡品牌创建一个中文产品网站，包含首页、关于我们和联系页面；产品线包括单品手冲、意式拼配和冷萃。",
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();

  const humanAnswer = page.getByRole("textbox", { name: "你的回答", exact: true });
  const hasHumanQuestion = await humanAnswer
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (hasHumanQuestion) {
    await humanAnswer.fill(
      "品牌名为海派烘焙；使用 Arclayer 当前 Builder，不要求外部技术栈或部署，先产出可审阅的网站计划；产品线包括单品手冲、意式拼配和冷萃。",
    );
    await page.getByRole("button", { name: "发送", exact: true }).last().click();
    await expect(humanAnswer).toBeHidden({ timeout: 90_000 });
  }
  await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeHidden({
    timeout: 90_000,
  });

  const threadComposer = page.getByRole("textbox", { name: "询问 AI…", exact: true }).last();
  await expect(threadComposer).toBeEditable();
  const buildRunResponsePromise = page.waitForResponse(
    (response) => {
      if (
        response.request().method() !== "POST" ||
        !/\/api\/v1\/workspaces\/[^/]+\/ai\/threads\/[^/]+\/runs$/u.test(response.url()) ||
        response.status() !== 202
      ) {
        return false;
      }
      const payload = response.request().postDataJSON() as { executionMode?: string };
      return payload.executionMode === "build";
    },
    { timeout: 90_000 },
  );
  await threadComposer.fill("确认计划");
  await page.getByRole("button", { name: "发送", exact: true }).last().click();
  const bootstrapApproval = page.getByRole("button", { name: "创建候选方案", exact: true });
  await expect(bootstrapApproval).toBeVisible({ timeout: 90_000 });

  const approvalResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/v1\/workspaces\/[^/]+\/ai\/tool-calls\/[^/]+\/responses$/u.test(response.url()),
    { timeout: 30_000 },
  );
  const resumeResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/v1\/workspaces\/[^/]+\/ai\/runs\/[^/]+\/resume$/u.test(response.url()),
    { timeout: 30_000 },
  );
  await bootstrapApproval.click();
  const approvalResponse = await approvalResponsePromise;
  expect(approvalResponse.status()).toBe(200);
  const resumeResponse = await resumeResponsePromise;
  expect(resumeResponse.status()).toBe(200);
  const buildRunResponse = await buildRunResponsePromise;
  const buildPayload = buildRunResponse.request().postDataJSON() as { executionMode?: string };
  expect(buildPayload.executionMode).toBe("build");
  const buildBody = (await buildRunResponse.json()) as { data?: { runId?: string } };
  const buildRunId = buildBody.data?.runId;
  const workspaceId = buildRunResponse.url().match(/\/workspaces\/([^/]+)\/ai\//u)?.[1];
  expect(buildRunId).toBeTruthy();
  expect(workspaceId).toBeTruthy();

  const snapshot = await waitForBuildCompletion(page, workspaceId!, buildRunId!);
  expect(snapshot.status).toBe(200);
  expect(snapshot.data?.status, snapshot.data?.error?.code ?? "Build failed").toBe("completed");
  expect(snapshot.data?.executionMode).toBe("build");
  expect(snapshot.data?.projectId).toBeTruthy();
  expect(snapshot.data?.siteRevisionId).toBeTruthy();

  const projectId = snapshot.data!.projectId!;
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/editor\\?stage=sitemap$`, "u"), {
    timeout: 90_000,
  });
  await expect(page.getByTestId("creation-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sitemap", exact: true })).toBeVisible();

  const builder = await page.evaluate(async (resolvedProjectId) => {
    const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
      state?: { accessToken?: unknown };
    } | null;
    const accessToken = auth?.state?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      throw new Error("LOCAL_E2E_AUTH_TOKEN_MISSING");
    }
    const response = await fetch(`/api/v1/projects/${resolvedProjectId}/builder`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { status: response.status, data: (await response.json()).data };
  }, projectId);
  expect(builder.status).toBe(200);
  expect(builder.data.authoringAuthority.mode).toBe("builder_managed");
  expect(builder.data.authoringAuthority.state).toBe("ready");
  expect(builder.data.primarySiteId).toBeTruthy();
  expect(builder.data.defaultPreviewEnvironmentId).toBeTruthy();
  expect(builder.data.currentSiteRevision).toBeTruthy();
  expect(builder.data.currentStatus.status).toBe("draft");
  expect(builder.data.initializationRequired).toBe(false);
  expect(builder.data.blockers).toEqual([]);

  const revisionId = builder.data.currentSiteRevision.id;
  const revision = await page.evaluate(
    async ({ resolvedProjectId, resolvedRevisionId }) => {
      const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
        state?: { accessToken?: unknown };
      } | null;
      const accessToken = auth?.state?.accessToken;
      if (typeof accessToken !== "string" || !accessToken) {
        throw new Error("LOCAL_E2E_AUTH_TOKEN_MISSING");
      }
      const response = await fetch(
        `/api/v1/projects/${resolvedProjectId}/builder/revisions/${resolvedRevisionId}`,
        { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return { status: response.status, data: (await response.json()).data };
    },
    { resolvedProjectId: projectId, resolvedRevisionId: revisionId },
  );
  expect(revision.status).toBe(200);
  expect(revision.data.siteRevision.revisionNumber).toBe(1);
  expect(revision.data.contentStructureRevision.revisionNumber).toBe(1);
  expect(revision.data.pages.length).toBeGreaterThan(0);
  expect(revision.data.pages.some((page: { title: string }) => page.title.length > 0)).toBe(true);
  expect(revision.data.status.status).toBe("draft");
});
