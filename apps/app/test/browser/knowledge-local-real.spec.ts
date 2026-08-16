import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { getBrowserAcceptanceFixture } from "@arclayer/browser-acceptance";

test.use({
  ignoreHTTPSErrors: true,
  colorScheme: "light",
  locale: "zh-CN",
  trace: "off",
  screenshot: "off",
  video: "off",
});

const productOrigin =
  process.env.LOCAL_E2E_PRODUCT_ORIGIN ??
  process.env.BROWSER_ACCEPTANCE_PRODUCT_ORIGIN ??
  "https://app.arclayer.localhost";
const aiTimeout = 180_000;

type ProductCredentials = Readonly<{ email: string; password: string }>;

type GuidanceLayer = {
  metadataRevision: number;
  currentPublished?: { id: string; content: string } | null;
  currentDraft?: { id: string; content: string } | null;
};

type RunSnapshot = {
  terminal?: boolean;
  run?: { status?: string };
  messages?: Array<{ role?: string; parts?: Array<{ text?: string }> }>;
  error?: { code?: string } | null;
};

async function productCredentials(): Promise<ProductCredentials> {
  const email = process.env.LOCAL_E2E_EMAIL;
  const password = process.env.LOCAL_E2E_PASSWORD;
  if (email || password) {
    if (!email || !password) throw new Error("LOCAL_E2E_CREDENTIALS_INCOMPLETE");
    return { email, password };
  }
  return (await getBrowserAcceptanceFixture()).product;
}

async function login(page: Page, credentials: ProductCredentials) {
  await page.goto(new URL("/login/", productOrigin).toString());
  await page.getByRole("button", { name: "使用邮箱登录", exact: true }).click();
  await page.getByLabel("电子邮箱", { exact: true }).fill(credentials.email);
  await page.getByLabel("密码", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(`${productOrigin}/`);
}

async function workspaceId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("arclayer:admin:workspace") ?? "null") as {
      state?: { lastWorkspaceId?: unknown };
    } | null;
    const id = stored?.state?.lastWorkspaceId;
    if (typeof id !== "string" || !id) throw new Error("LOCAL_E2E_WORKSPACE_ID_MISSING");
    return id;
  });
}

async function authenticatedRequest<T>(
  page: Page,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return page.evaluate(
    async ({ requestPath, requestInit }) => {
      const auth = JSON.parse(localStorage.getItem("arclayer:admin:auth") ?? "null") as {
        state?: { accessToken?: unknown };
      } | null;
      const accessToken = auth?.state?.accessToken;
      if (typeof accessToken !== "string" || !accessToken) {
        throw new Error("LOCAL_E2E_AUTH_TOKEN_MISSING");
      }
      const csrfToken = document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith("csrf_token="))
        ?.split("=")[1];
      const response = await fetch(requestPath, {
        ...requestInit,
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          ...requestInit.headers,
        },
      });
      const body = (await response.json()) as { data?: T; error?: unknown };
      if (!response.ok) throw new Error(`LOCAL_E2E_REQUEST_${response.status}`);
      return body.data as T;
    },
    { requestPath: path, requestInit: init },
  );
}

async function saveDraft(page: Page, path: string, layer: GuidanceLayer, content: string) {
  return authenticatedRequest<GuidanceLayer>(page, `${path}/draft`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `knowledge-local-draft-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ content, expectedRevision: layer.metadataRevision }),
  });
}

async function publishDraft(page: Page, path: string, layer: GuidanceLayer) {
  const revisionId = layer.currentDraft?.id;
  if (!revisionId) throw new Error("LOCAL_E2E_DRAFT_REQUIRED");
  return authenticatedRequest<GuidanceLayer>(page, `${path}/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `knowledge-local-publish-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ expectedRevision: layer.metadataRevision, revisionId }),
  });
}

function stripAcceptanceMarkers(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/\[WORKSPACE_KNOWLEDGE_[^\]]+\]/gu, "")
    .replace(/ARCLAYER-KNOWLEDGE-[A-Z0-9]+/gu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

async function waitForRun(page: Page, workspace: string, runId: string): Promise<RunSnapshot> {
  const deadline = Date.now() + aiTimeout;
  let snapshot = await authenticatedRequest<RunSnapshot>(
    page,
    `/api/v1/workspaces/${workspace}/ai/runs/${runId}`,
  );
  while (
    !snapshot.terminal &&
    ["created", "queued", "running"].includes(snapshot.run?.status ?? "")
  ) {
    if (Date.now() >= deadline) throw new Error("LOCAL_E2E_AI_RUN_TIMEOUT");
    await page.waitForTimeout(2_000);
    snapshot = await authenticatedRequest<RunSnapshot>(
      page,
      `/api/v1/workspaces/${workspace}/ai/runs/${runId}`,
    );
  }
  return snapshot;
}

async function choosePlanMode(page: Page) {
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
    throw new Error("LOCAL_E2E_PLAN_MODE_MISSING");
  });
  await expect(modeButton).toContainText("规划");
}

test("工作空间知识：编辑器能力、发布与真实 AI 消费", async ({ page }) => {
  test.setTimeout(aiTimeout + 120_000);

  await login(page, await productCredentials());
  const workspace = await workspaceId(page);
  const originalProjectId = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("arclayer:admin:workspace") ?? "null") as {
      state?: { lastProjectId?: string | null };
    } | null;
    return stored?.state?.lastProjectId ?? null;
  });
  const guidancePath = `/api/v1/workspaces/${workspace}/guidance`;
  const original = await authenticatedRequest<GuidanceLayer>(page, guidancePath);
  const originalPublished = stripAcceptanceMarkers(original.currentPublished?.content);
  const originalDraft = stripAcceptanceMarkers(original.currentDraft?.content);
  if (!originalPublished) throw new Error("LOCAL_E2E_PUBLISHED_GUIDANCE_REQUIRED");

  const marker = `ARCLAYER-KNOWLEDGE-${Date.now().toString(36).toUpperCase()}`;
  let runId: string | null = null;
  let threadId: string | null = null;

  try {
    await page.goto(`${productOrigin}/customization/knowledge`);
    const editor = page.getByRole("textbox", { name: "工作空间知识", exact: true });
    await expect(editor).toBeVisible({ timeout: 30_000 });

    const toolbar = page.getByRole("toolbar", { name: "知识格式工具栏", exact: true });
    for (const label of [
      "转换为",
      "加粗",
      "斜体",
      "下划线",
      "删除线",
      "无序列表",
      "有序列表",
      "链接",
      "导入 Markdown",
      "导出 Markdown",
    ]) {
      await expect(toolbar.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(toolbar.getByRole("button", { name: "表格", exact: true })).toHaveCount(2);
    for (const label of [
      "行内代码",
      "代码块",
      "待办列表",
      "图片",
      "视频",
      "文件",
      "音频",
      "公式",
      "文本颜色",
      "背景颜色",
    ]) {
      await expect(toolbar.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }

    const importInput = page.locator('input[type="file"][accept*=".md"]');
    await importInput.setInputFiles({
      name: "workspace-knowledge-capabilities.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        [
          "# 导入标题",
          "",
          "**加粗内容**、*斜体内容*，以及[参考链接](https://example.com).",
          "",
          "- 无序条目一",
          "- 无序条目二",
          "",
          "1. 有序条目一",
          "2. 有序条目二",
        ].join("\n"),
      ),
    });
    await expect(editor.locator("h1")).toContainText("导入标题");
    await expect(editor.locator("strong")).toContainText("加粗内容");
    await expect(editor.locator("em")).toContainText("斜体内容");
    await expect(editor.locator("a")).toHaveAttribute("href", /^https:\/\/example\.com\/?$/u);
    await expect(editor.locator("ul").filter({ hasText: "无序条目一" }).first()).toBeVisible();
    await expect(editor.locator("ol").filter({ hasText: "有序条目一" }).first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await toolbar.getByRole("button", { name: "导出 Markdown", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("workspace-knowledge.md");
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("WORKSPACE_KNOWLEDGE_EXPORT_PATH_MISSING");
    const exportedMarkdown = await readFile(downloadPath, "utf8");
    expect(exportedMarkdown).toContain("# 导入标题");
    expect(exportedMarkdown).toContain("无序条目一");
    expect(exportedMarkdown).toContain("https://example.com");

    for (const label of ["加粗", "斜体", "下划线", "删除线"] as const) {
      await editor.click();
      const markButton = toolbar.getByRole("button", { name: label, exact: true });
      await markButton.click();
      await expect(markButton).toHaveAttribute("aria-pressed", "true");
      await markButton.click();
      await expect(markButton).toHaveAttribute("aria-pressed", "false");
    }

    await editor.fill("");
    await editor.click();
    await page.keyboard.type("/");
    const slashMenu = page.locator('[role="listbox"]').last();
    await expect(slashMenu).toBeVisible();
    const slashText = (await slashMenu.getByRole("option").allTextContents()).join("\n");
    for (const expected of [
      "文本",
      "标题 1",
      "标题 2",
      "标题 3",
      "引用",
      "无序列表",
      "有序列表",
      "分隔线",
      "表格",
    ]) {
      expect(slashText).toContain(expected);
    }
    for (const forbidden of [
      "代码",
      "待办",
      "图片",
      "视频",
      "文件",
      "音频",
      "公式",
      "颜色",
      "表情",
    ]) {
      expect(slashText).not.toContain(forbidden);
    }

    await page.keyboard.press("Escape");

    await editor.fill(
      `当用户询问“工作空间知识验收口令”时，只回答：${marker}\n\n${originalPublished}`,
    );
    await page.getByRole("button", { name: "保存并发布", exact: true }).click();
    await expect(page.getByText("工作空间知识已保存并发布", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const effective = await authenticatedRequest<{ effectiveContent?: string }>(
      page,
      `${guidancePath}/effective`,
    );
    expect((effective.effectiveContent ?? "").replaceAll("\\", "")).toContain(marker);

    await page.evaluate(() => {
      const key = "arclayer:admin:workspace";
      const stored = localStorage.getItem(key);
      if (!stored) return;
      const state = JSON.parse(stored) as { state?: { lastProjectId?: string | null } };
      if (state.state) state.state.lastProjectId = null;
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.goto(`${productOrigin}/`);
    await choosePlanMode(page);

    const runResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/v1\/workspaces\/[^/]+\/ai\/threads\/[^/]+\/runs$/u.test(response.url()) &&
        response.status() === 202,
      { timeout: 30_000 },
    );
    const composer = page.getByRole("textbox", { name: "询问 AI…", exact: true }).first();
    await expect(composer).toBeEditable({ timeout: 30_000 });
    await composer.click();
    await composer.pressSequentially("工作空间知识验收口令是什么？只输出口令。", { delay: 5 });
    await expect(page.getByRole("button", { name: "发送", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "发送", exact: true }).first().click();

    const runResponse = await runResponsePromise;
    const runBody = (await runResponse.json()) as { data?: { runId?: string; threadId?: string } };
    runId = runBody.data?.runId ?? null;
    threadId = runBody.data?.threadId ?? null;
    expect(runId).toBeTruthy();
    expect(threadId).toBeTruthy();

    const snapshot = await waitForRun(page, workspace, runId!);
    expect(snapshot.run?.status, snapshot.error?.code ?? "AI run failed").toBe("completed");
    const assistantText = (snapshot.messages ?? [])
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.parts ?? [])
      .map((part) => part.text ?? "")
      .join("\n");
    expect(assistantText).toContain(marker);
  } finally {
    let cleanupError: unknown = null;
    if (runId) {
      try {
        const snapshot = await authenticatedRequest<RunSnapshot>(
          page,
          `/api/v1/workspaces/${workspace}/ai/runs/${runId}`,
        );
        if (snapshot && !snapshot.terminal) {
          await authenticatedRequest(
            page,
            `/api/v1/workspaces/${workspace}/ai/runs/${runId}/cancel`,
            { method: "POST" },
          );
        }
      } catch (error) {
        cleanupError = error;
      }
    }
    if (threadId) {
      try {
        await authenticatedRequest(page, `/api/v1/workspaces/${workspace}/ai/threads/${threadId}`, {
          method: "DELETE",
        });
      } catch (error) {
        cleanupError ??= error;
      }
    }

    try {
      const latest = await authenticatedRequest<GuidanceLayer>(page, guidancePath);
      const restoredPublished = await publishDraft(
        page,
        guidancePath,
        await saveDraft(page, guidancePath, latest, originalPublished),
      );
      if (originalDraft) {
        await saveDraft(page, guidancePath, restoredPublished, originalDraft);
      }
      const restoredEffective = await authenticatedRequest<{ effectiveContent?: string }>(
        page,
        `${guidancePath}/effective`,
      );
      expect((restoredEffective.effectiveContent ?? "").replaceAll("\\", "")).not.toContain(marker);
    } catch (error) {
      cleanupError ??= error;
    }

    await page.evaluate((projectId) => {
      const key = "arclayer:admin:workspace";
      const stored = localStorage.getItem(key);
      if (!stored) return;
      const state = JSON.parse(stored) as { state?: { lastProjectId?: string | null } };
      if (state.state) state.state.lastProjectId = projectId;
      localStorage.setItem(key, JSON.stringify(state));
    }, originalProjectId);
    expect(cleanupError).toBeNull();
  }
});
