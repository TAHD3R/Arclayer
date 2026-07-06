import { describe, expect, it } from "vitest";

import enContent from "@locales/en-US/content.json";
import zhContent from "@locales/zh-CN/content.json";

const EN_SITE_BUILDER_COPY = {
  CONTENT_BOOTSTRAP_PRESET_POST_DESC: "Best for updates, stories, and content published over time.",
  CONTENT_BOOTSTRAP_PRESET_POST_NAME: "Update",
  CONTENT_BOOTSTRAP_PRESET_POST_USE_CASE:
    "this content belongs in a site listing and benefits from categorization.",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_DESC:
    "Long-form pages usually need a permanent link and publishing visibility before writing continues.",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_LABEL: "Long-form settings",
  CONTENT_BOOTSTRAP_CREATE_DESC:
    "Start by choosing the website model and editing surface, then set the name, description, and structure-specific details before the draft enters Content Library.",
  CONTENT_BOOTSTRAP_FIELD_MODEL_DESC:
    "Choose the website model first. Official models cover common site-builder flows, and custom models live in the model control center.",
  CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY:
    "This workspace does not have any available website models yet. Create or adjust one in the model control center, then come back to create a page, block, or record.",
  CONTENT_BOOTSTRAP_FIELD_MODEL_LABEL: "Website model",
  CONTENT_BOOTSTRAP_START_CURRENT_TEMPLATE_PREFIX: "Selected blueprint:",
  CONTENT_BOOTSTRAP_TITLE: "Create Site Record",
  CONTENT_ITEM_CONTINUATION_BLOCKED_DESC:
    "The page, block, or record exists, but continuation is currently blocked. Resolve the issue below before continuing.",
  CONTENT_ITEM_CONTINUATION_BLOCKED_TITLE: "This page, block, or record needs recovery first",
  CONTENT_ITEM_CONTINUATION_LOADING_DESC:
    "Checking the backend continuation target for this page, block, or record.",
  CONTENT_ITEM_CONTINUATION_LOADING_TITLE: "Resolving editing surface",
  CONTENT_ITEM_CONTINUATION_LOAD_ERROR_DESC:
    "Admin could not load the backend continuation truth for this page, block, or record.",
  CONTENT_ITEM_CONTINUATION_SURFACE_UNAVAILABLE_TITLE: "This editing surface is not wired yet",
  CONTENT_LIBRARY_ARCHIVE_DIALOG_DESC: "Archive the current version of {{name}}.",
  CONTENT_LIBRARY_ACTION_BULK_PUBLISH: "Publish selected",
  CONTENT_LIBRARY_ACTION_BULK_UNPUBLISH: "Unpublish selected",
  CONTENT_LIBRARY_BULK_ARCHIVE_DIALOG_TITLE: "Archive selected records",
  CONTENT_LIBRARY_BULK_ARCHIVE_SUCCESS: "Selected records archived.",
  CONTENT_LIBRARY_BULK_DELETE_DIALOG_TITLE: "Delete selected records",
  CONTENT_LIBRARY_BULK_DELETE_SUCCESS: "Selected records deleted.",
  CONTENT_LIBRARY_BULK_PUBLISH_SUCCESS: "Selected records published.",
  CONTENT_LIBRARY_BULK_UNPUBLISH_SUCCESS: "Selected records unpublished.",
  CONTENT_LIBRARY_EDITOR_COVER_DIALOG_DESC:
    "Select or upload a cover image for this page or site record.",
  CONTENT_LIBRARY_EDITOR_EXPORT_DIALOG_DESC:
    "Export the current content body using a supported format.",
  CONTENT_LIBRARY_EDITOR_IMPORT_DIALOG_DESC:
    "Replace the current content body from a supported source format.",
  CONTENT_LIBRARY_EDITOR_LOADING_TITLE: "Loading content editor",
  CONTENT_LIBRARY_EDITOR_SEARCH_DIALOG_TITLE: "Search content",
  CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER: "Untitled page",
  CONTENT_LIBRARY_EDITOR_UPDATES_EMPTY:
    "No updates were recorded for this page, block, or record yet.",
  CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_DESC:
    "Review recent saved versions for this page, block, or record.",
  CONTENT_LIBRARY_EMPTY_INITIAL_TITLE: "Start creating pages, blocks, or records",
  CONTENT_LIBRARY_EMPTY_TABLE: "No pages, blocks, or records",
  CONTENT_LIBRARY_FILTER_CREATED_BY_PLACEHOLDER: "Select creator",
  CONTENT_LIBRARY_FILTER_FIELD_CONTENT_TYPE: "Model",
  CONTENT_LIBRARY_FILTER_FIELD_CREATED_BY: "Creator",
  CONTENT_LIBRARY_FILTER_FIELD_LOCALE: "Language",
  CONTENT_LIBRARY_FILTER_FIELD_TAGS: "Tags",
  CONTENT_LIBRARY_FILTER_LOCALE_PLACEHOLDER: "Select language",
  CONTENT_LIBRARY_FILTER_TAGS_PLACEHOLDER: "Select tags",
  CONTENT_LIBRARY_PREVIEW_FIELD_CONTENT_TYPE: "Model",
  CONTENT_LIBRARY_GROUP_GENERAL_CONTENT: "General records",
  CONTENT_LIBRARY_GROUP_STRUCTURED_CONTENT: "Structured records",
  CONTENT_LIBRARY_PANEL_TITLE: "Workbench views",
  CONTENT_LIBRARY_RECORD_DRAWER_TITLE: "Record summary",
  CONTENT_LIBRARY_ROLE_ARTICLE: "Long-form page",
  CONTENT_LIBRARY_ROW_ACTIONS: "Library actions",
  CONTENT_LIBRARY_ROW_UNTYPED: "No model assigned",
  CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_ARTICLE: "This long-form page does not have a description yet.",
  CONTENT_LIBRARY_SEARCH_PLACEHOLDER: "Search pages, blocks, and records",
  CONTENT_LIBRARY_SECTION_BY_TYPE: "By model",
  CONTENT_LIBRARY_TABLE_COL_CONTENT_TYPE: "Model",
  CONTENT_MODELS_CREATE_TITLE: "Create website model",
  CONTENT_MODELS_CREATE_UNTITLED_NAME: "Untitled website model",
  CONTENT_MODELS_CREATE_AI_CHAT_EMPTY:
    'Ask me anything about creating a website model. For example: "Create a customer story record set with title, logo, results, and CTA fields."',
  CONTENT_MODELS_CREATE_AI_PROMPT_CUSTOMER_STORIES_TEXT:
    "Create a customer story record set for a marketing site. It should include company logo, quote, customer name, role, results metrics, CTA label, CTA URL, and be publishable for website listings.",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_CHECKLIST_LABEL: "AI CRUD contract checks",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_FIELD_SCHEMA_TITLE: "Field schema",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_RELEASE_SOURCE_TITLE: "Release and source",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_ROUTE_SURFACE_TITLE: "Route and surface",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_STABLE_KEYS_TITLE: "Stable keys",
  CONTENT_MODELS_BLUEPRINT_NEXT_READY:
    "The structure is ready for site content. Continue refining fields or let AI create pages, blocks, and records against these models.",
  CONTENT_MODELS_CREATE_MODEL_TYPE_TITLE: "Structure",
  CONTENT_MODELS_FIELD_MODEL_KIND: "Structure",
  CONTENT_MODELS_TAB_EDITORS: "Editing surfaces",
  CONTENT_MODELS_FIELD_TYPE_RICH_TEXT_DESC:
    "Compose formatted long-form content, body copy, and structured narrative blocks.",
  CONTENT_MODELS_KIND_COLLECTION_TYPE: "Repeatable records",
  CONTENT_MODELS_KIND_COLLECTION_TYPE_DESC:
    "Use for pages, listings, reusable website records, or any model that can create many records.",
  CONTENT_MODELS_SETTINGS_CAPABILITY_VERSIONED_DESC:
    "Keep full version history for each page, block, or record.",
  CONTENT_MODELS_SETTINGS_CAPABILITY_HAS_SLOTS_DESC:
    "Allow reusable blocks to bind into named content slots.",
  CONTENT_MODELS_WORKFLOW_PUBLISH_DESC:
    "Publishing decides which pages, blocks, and records can move through draft, review, and release flows.",
  CONTENT_MODELS_WORKFLOW_PAGE_MODEL_DESC:
    "A page model gives routing, SEO, preview, and generated pages one shared structure.",
  CONTENT_STRUCTURED_SURFACE_FIELD_MODEL: "Model",
  CONTENT_TYPE_ARTICLE_NAME: "Long-form page",
  CONTENT_TYPE_CATEGORY_DESC:
    "Best for relation-first taxonomy records that organize pages, blocks, and other structured content.",
} as const;

const ZH_SITE_BUILDER_COPY = {
  CONTENT_BOOTSTRAP_PRESET_POST_DESC: "适合动态、故事和按时间发布的内容。",
  CONTENT_BOOTSTRAP_PRESET_POST_NAME: "动态",
  CONTENT_BOOTSTRAP_PRESET_POST_USE_CASE: "这条内容会进入站点列表，并受益于分类管理。",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_DESC:
    "长文页面通常需要先定好永久链接和可见性，后续写作才更顺。",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_LABEL: "长文设置",
  CONTENT_BOOTSTRAP_CREATE_DESC:
    "先选择网站模型和编辑方式，再在进入内容库前补齐名称、描述和结构相关设置。",
  CONTENT_BOOTSTRAP_FIELD_MODEL_DESC:
    "先选择网站模型。官方模型覆盖常见站点构建流程，自定义模型可以在模型控制台管理。",
  CONTENT_BOOTSTRAP_FIELD_MODEL_LABEL: "网站模型",
  CONTENT_BOOTSTRAP_START_CURRENT_TEMPLATE_PREFIX: "当前选择的蓝图：",
  CONTENT_BOOTSTRAP_TITLE: "创建站点记录",
  CONTENT_ITEM_CONTINUATION_BLOCKED_TITLE: "这个页面、区块或记录需要先恢复",
  CONTENT_ITEM_CONTINUATION_LOADING_DESC:
    "正在读取这个页面、区块或记录的后端 continuation target。",
  CONTENT_ITEM_CONTINUATION_LOAD_ERROR_DESC:
    "Admin 无法读取这个页面、区块或记录的后端 continuation truth。",
  CONTENT_LIBRARY_ARCHIVE_DIALOG_DESC: "归档 {{name}} 的当前版本。",
  CONTENT_LIBRARY_DIALOG_STRUCTURED_FIELDS_DESC: "编辑站点记录的核心字段。",
  CONTENT_LIBRARY_EMPTY_INITIAL_TITLE: "开始创建页面、区块或记录",
  CONTENT_LIBRARY_GROUP_STRUCTURED_CONTENT: "站点记录",
  CONTENT_LIBRARY_EDITOR_COVER_DIALOG_DESC: "为这个页面或站点记录选择或上传封面图。",
  CONTENT_LIBRARY_EDITOR_EXPORT_DIALOG_DESC: "使用受支持的格式导出当前内容正文。",
  CONTENT_LIBRARY_EDITOR_IMPORT_DIALOG_DESC: "从受支持的源格式替换当前内容正文。",
  CONTENT_LIBRARY_EDITOR_LOADING_TITLE: "正在加载内容编辑器",
  CONTENT_LIBRARY_EDITOR_SEARCH_DIALOG_TITLE: "搜索内容",
  CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER: "未命名页面",
  CONTENT_LIBRARY_EMPTY_TABLE: "没有页面、区块或记录",
  CONTENT_LIBRARY_FILTER_FIELD_CONTENT_TYPE: "模型",
  CONTENT_LIBRARY_NO_ACCESS_DESC:
    "可查看页面、区块和记录并打开预览。需要新建、更新、归档或删除时，请让工作空间管理员开启内容管理权限。",
  CONTENT_LIBRARY_PREVIEW_FIELD_CONTENT_TYPE: "模型",
  CONTENT_LIBRARY_PREVIEW_PANEL_DESC: "先快速查看这个页面、区块或记录，再决定是否进入编辑器。",
  CONTENT_LIBRARY_PREVIEW_STRUCTURED_NEXT_DESC: "确认基本信息后，从字段入口编辑站点记录。",
  CONTENT_LIBRARY_PREVIEW_SUMMARY_EMPTY_STRUCTURED: "这条结构化记录还没有摘要。",
  CONTENT_LIBRARY_PUBLISH_NO_ACCESS_DESC:
    "你可以继续编辑草稿。需要发布这个页面、区块或记录时，请让工作空间管理员开启发布权限。",
  CONTENT_LIBRARY_PANEL_TITLE: "工作台视图",
  CONTENT_LIBRARY_RECORD_DRAWER_TITLE: "记录摘要",
  CONTENT_LIBRARY_ROLE_ARTICLE: "长文页面",
  CONTENT_LIBRARY_ROW_ACTIONS: "库操作",
  CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_ARTICLE: "这个长文页面还没有描述。",
  CONTENT_LIBRARY_ROW_UNTYPED: "未绑定模型",
  CONTENT_LIBRARY_SEARCH_PLACEHOLDER: "搜索页面、区块和记录",
  CONTENT_LIBRARY_SECTION_BY_TYPE: "按模型",
  CONTENT_LIBRARY_TABLE_COL_CONTENT_TYPE: "模型",
  CONTENT_MODELS_CREATE_AI_CHAT_EMPTY:
    "你可以直接描述要创建的网站模型。例如：“创建一个客户案例记录集，包含标题、Logo、成果数据和 CTA 字段。”",
  CONTENT_MODELS_CREATE_AI_PROMPT_CUSTOMER_STORIES_TEXT:
    "创建一个用于营销网站的客户案例记录集。它应该包含公司 Logo、引用语、客户姓名、职位、成果指标、CTA 文案、CTA URL，并可发布到网站列表中。",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_CHECKLIST_LABEL: "AI CRUD 契约检查项",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_FIELD_SCHEMA_TITLE: "字段结构",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_RELEASE_SOURCE_TITLE: "发布与源码",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_ROUTE_SURFACE_TITLE: "路由与编辑面",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_STABLE_KEYS_TITLE: "稳定键",
  CONTENT_MODELS_BLUEPRINT_NEXT_READY:
    "当前结构已可以承载站点内容。可以继续细化字段，或让 AI 基于这些模型创建页面、区块和记录。",
  CONTENT_MODELS_CREATE_MODEL_TYPE_TITLE: "结构",
  CONTENT_MODELS_FIELD_MODEL_KIND: "结构",
  CONTENT_MODELS_KIND_COLLECTION_TYPE: "可重复记录",
  CONTENT_MODELS_SETTINGS_CAPABILITY_HAS_SLOTS_DESC: "允许可复用区块绑定到命名内容插槽。",
  CONTENT_MODELS_TAB_EDITORS: "编辑界面",
  CONTENT_STRUCTURED_SURFACE_FIELDS_CHANGE_SUMMARY: "更新站点记录字段。",
  CONTENT_STRUCTURED_SURFACE_NEXT_DESC:
    "站点记录的轻量维护仍然应该留在内容库里完成。回到内容库后，你可以从“编辑主要字段”继续补充这条记录。",
  CONTENT_STRUCTURED_SURFACE_TITLE: "站点记录",
  CONTENT_STRUCTURED_SURFACE_FIELD_MODEL: "模型",
  CONTENT_SURFACE_BOUNDARY_ITEM_CAPABILITIES: "当前记录能力",
  CONTENT_TYPE_ARTICLE_NAME: "长文页面",
  CONTENT_TYPE_CATEGORY_DESC:
    "适合优先表达关系和聚合语义的 taxonomy 记录，用来归类页面、区块和其他内容。",
} as const;

describe("content library site-builder copy", () => {
  it("keeps English workbench labels in model and site-content language", () => {
    expect(enContent).toMatchObject(EN_SITE_BUILDER_COPY);
  });

  it("keeps Chinese workbench labels in model and site-content language", () => {
    expect(zhContent).toMatchObject(ZH_SITE_BUILDER_COPY);
  });

  it("does not expose legacy CMS article/type wording in content workbench copy", () => {
    const blockedTerms = [
      /\bContent type\b/i,
      /\bCreate Content\b/i,
      /\bBy type\b/i,
      /\bCurrent template type\b/i,
      /\bNew Article\b/i,
      /\bSearch article\b/i,
      /\bArticle\b/,
      /\bContent Views\b/i,
      /\bcontent item\b/i,
      /\bcontent items\b/i,
      /\bcontent surface\b/i,
      /\bcontent version\b/i,
      /\bEntry editors\b/i,
      /\bLong-form entry\b/i,
      /\bModel kind\b/i,
      /\bModel type\b/i,
      /\bcustomer story collection\b/i,
      /\btype-specific\b/i,
      /\bUntyped content\b/i,
      /客户案例集合/,
      /合集/,
      /文章/,
      /内容视图/,
      /结构化内容/,
      /模板类型/,
      /长文条目/,
      /内容条目/,
      /内容项/,
      /类型相关设置/,
      /未设定类型/,
      /按类型/,
      /模型类型/,
    ];
    const values = [...Object.values(enContent), ...Object.values(zhContent)];

    for (const value of values) {
      if (typeof value !== "string") continue;
      for (const term of blockedTerms) {
        expect(value, `${String(term)} matched "${value}"`).not.toMatch(term);
      }
    }
  });
});
