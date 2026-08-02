import { describe, expect, it } from "vitest";

import enContent from "@locales/en-US/content.json";
import zhContent from "@locales/zh-CN/content.json";

const EN_SITE_BUILDER_COPY = {
  CONTENT_BOOTSTRAP_PRESET_POST_DESC: "Best for updates, stories, and content published over time.",
  CONTENT_BOOTSTRAP_PRESET_POST_NAME: "Update",
  CONTENT_BOOTSTRAP_PRESET_POST_USE_CASE:
    "Use when this content appears in site listings and needs categories.",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_DESC:
    "Long-form pages usually need a permanent link and publishing visibility before writing continues.",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_LABEL: "Long-form settings",
  CONTENT_BOOTSTRAP_CREATE_DESC:
    "Choose the site content model and editing method, then set the name, description, and related details.",
  CONTENT_BOOTSTRAP_FIELD_MODEL_DESC:
    "Choose a site content model first. Built-in models cover common site-building needs, and you can manage custom models in Content models.",
  CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY:
    "This workspace has no site content models yet. Create or adjust one in Content models, then come back to create content.",
  CONTENT_BOOTSTRAP_FIELD_MODEL_LABEL: "Site content model",
  CONTENT_BOOTSTRAP_START_CURRENT_TEMPLATE_PREFIX: "Selected blueprint:",
  CONTENT_BOOTSTRAP_TITLE: "Create site content",
  CONTENT_ITEM_CONTINUATION_BLOCKED_DESC:
    "The page, block, or content exists, but you cannot continue editing it yet. Resolve the issue below first.",
  CONTENT_ITEM_CONTINUATION_BLOCKED_TITLE: "You can't continue editing this content yet",
  CONTENT_ITEM_CONTINUATION_LOADING_DESC:
    "Finding where you can continue editing this page, block, or content.",
  CONTENT_ITEM_CONTINUATION_LOADING_TITLE: "Preparing to continue editing",
  CONTENT_ITEM_CONTINUATION_LOAD_ERROR_DESC:
    "We couldn't load what is needed to continue editing this page, block, or content.",
  CONTENT_ITEM_CONTINUATION_SURFACE_UNAVAILABLE_TITLE:
    "You can't continue editing this content yet",
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
    "Select or upload a cover image for this page or content.",
  CONTENT_LIBRARY_EDITOR_EXPORT_DIALOG_DESC:
    "Export the current content body using a supported format.",
  CONTENT_LIBRARY_EDITOR_IMPORT_DIALOG_DESC:
    "Replace the current content body from a supported source format.",
  CONTENT_LIBRARY_EDITOR_LOADING_TITLE: "Loading content editor",
  CONTENT_LIBRARY_EDITOR_SEARCH_DIALOG_TITLE: "Search content",
  CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER: "Untitled page",
  CONTENT_LIBRARY_EDITOR_UPDATES_EMPTY:
    "There are no updates for this page, block, or content item yet.",
  CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_DESC:
    "Review recent saved versions of this page, block, or content item.",
  CONTENT_LIBRARY_EMPTY_INITIAL_TITLE: "Start creating pages, blocks, or records",
  CONTENT_LIBRARY_EMPTY_TABLE: "No pages, blocks, or records",
  CONTENT_LIBRARY_FILTER_CREATED_BY_PLACEHOLDER: "Select creator",
  CONTENT_LIBRARY_FILTER_FIELD_CONTENT_TYPE: "Content model",
  CONTENT_LIBRARY_FILTER_FIELD_CREATED_BY: "Creator",
  CONTENT_LIBRARY_FILTER_FIELD_LOCALE: "Language",
  CONTENT_LIBRARY_FILTER_FIELD_TAGS: "Tags",
  CONTENT_LIBRARY_FILTER_LOCALE_PLACEHOLDER: "Select language",
  CONTENT_LIBRARY_FILTER_TAGS_PLACEHOLDER: "Select tags",
  CONTENT_LIBRARY_PREVIEW_FIELD_CONTENT_TYPE: "Content model",
  CONTENT_LIBRARY_GROUP_GENERAL_CONTENT: "General content",
  CONTENT_LIBRARY_GROUP_STRUCTURED_CONTENT: "Structured content",
  CONTENT_LIBRARY_PANEL_TITLE: "Workbench views",
  CONTENT_LIBRARY_RECORD_DRAWER_TITLE: "Content summary",
  CONTENT_LIBRARY_ROLE_ARTICLE: "Long-form page",
  CONTENT_LIBRARY_ROW_ACTIONS: "Content actions",
  CONTENT_LIBRARY_ROW_UNTYPED: "No content model selected",
  CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_ARTICLE: "This long-form page does not have a description yet.",
  CONTENT_LIBRARY_SEARCH_PLACEHOLDER: "Search pages, blocks, and content items",
  CONTENT_LIBRARY_SECTION_BY_TYPE: "By content model",
  CONTENT_LIBRARY_TABLE_COL_CONTENT_TYPE: "Content model",
  CONTENT_MODELS_CREATE_TITLE: "Create content model",
  CONTENT_MODELS_CREATE_UNTITLED_NAME: "Untitled content model",
  CONTENT_MODELS_CREATE_AI_CHAT_EMPTY:
    'Describe the content model you want to create. For example: "Create a customer story content model with title, logo, results, and call-to-action fields."',
  CONTENT_MODELS_CREATE_AI_PROMPT_CUSTOMER_STORIES_TEXT:
    "Create a customer story content model for a marketing site. Include a company logo, quote, customer name, role, results metrics, call-to-action copy, and link. It should be publishable to a website listing page.",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_CHECKLIST_LABEL: "What Agents need before creating content",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_FIELD_SCHEMA_TITLE: "Field settings",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_RELEASE_SOURCE_TITLE: "Publishing settings",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_ROUTE_SURFACE_TITLE: "Page URLs and editing",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_STABLE_KEYS_TITLE: "Unique IDs",
  CONTENT_MODELS_BLUEPRINT_NEXT_READY:
    "This structure is ready for site content. Keep refining fields, or let Agents create pages, blocks, and content items from these models.",
  CONTENT_MODELS_CREATE_MODEL_TYPE_TITLE: "Content structure",
  CONTENT_MODELS_FIELD_MODEL_KIND: "Content structure",
  CONTENT_MODELS_TAB_EDITORS: "Editing options",
  CONTENT_MODELS_FIELD_TYPE_RICH_TEXT_DESC:
    "Compose formatted long-form content, body copy, and structured narrative blocks.",
  CONTENT_MODELS_KIND_COLLECTION_TYPE: "Content collection",
  CONTENT_MODELS_KIND_COLLECTION_TYPE_DESC:
    "Use for pages, customer stories, resource lists, and any model that can create many content items.",
  CONTENT_MODELS_SETTINGS_CAPABILITY_VERSIONED_DESC:
    "Keep a full version history for each page, block, or content item.",
  CONTENT_MODELS_SETTINGS_CAPABILITY_HAS_SLOTS_DESC:
    "Allow reusable blocks to be placed in named page content areas.",
  CONTENT_MODELS_WORKFLOW_PUBLISH_DESC:
    "Publishing settings determine which pages, blocks, and content items can move through draft, review, and publishing.",
  CONTENT_MODELS_WORKFLOW_PAGE_MODEL_DESC:
    "A page content model gives page URLs, SEO, previews, and page content one shared structure.",
  CONTENT_STRUCTURED_SURFACE_FIELD_MODEL: "Content model",
  CONTENT_TYPE_ARTICLE_NAME: "Long-form page",
  CONTENT_TYPE_CATEGORY_DESC: "Best for categories that organize pages, blocks, and other content.",
} as const;

const ZH_SITE_BUILDER_COPY = {
  CONTENT_BOOTSTRAP_PRESET_POST_DESC: "适合动态、故事和按时间发布的内容。",
  CONTENT_BOOTSTRAP_PRESET_POST_NAME: "动态",
  CONTENT_BOOTSTRAP_PRESET_POST_USE_CASE: "适合出现在站点列表中，并需要分类管理的内容。",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_DESC:
    "长文页面通常需要先定好永久链接和可见性，后续写作才更顺。",
  CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_LABEL: "长文设置",
  CONTENT_BOOTSTRAP_CREATE_DESC: "先选择站点内容模型和编辑方式，再补齐名称、描述和相关设置。",
  CONTENT_BOOTSTRAP_FIELD_MODEL_DESC:
    "先选择站点内容模型。预置模型覆盖常见的站点搭建需求，自定义模型可在内容模型中管理。",
  CONTENT_BOOTSTRAP_FIELD_MODEL_LABEL: "站点内容模型",
  CONTENT_BOOTSTRAP_START_CURRENT_TEMPLATE_PREFIX: "当前选择的蓝图：",
  CONTENT_BOOTSTRAP_TITLE: "创建站点内容",
  CONTENT_ITEM_CONTINUATION_BLOCKED_TITLE: "暂时无法继续编辑此内容",
  CONTENT_ITEM_CONTINUATION_LOADING_DESC: "正在查找这个页面、区块或内容可继续编辑的位置。",
  CONTENT_ITEM_CONTINUATION_LOAD_ERROR_DESC: "无法加载继续编辑这个页面、区块或内容所需的信息。",
  CONTENT_LIBRARY_ARCHIVE_DIALOG_DESC: "归档 {{name}} 的当前版本。",
  CONTENT_LIBRARY_DIALOG_STRUCTURED_FIELDS_DESC: "编辑内容的核心字段。",
  CONTENT_LIBRARY_EMPTY_INITIAL_TITLE: "开始创建页面、区块或记录",
  CONTENT_LIBRARY_GROUP_STRUCTURED_CONTENT: "结构化内容",
  CONTENT_LIBRARY_EDITOR_COVER_DIALOG_DESC: "为这个页面或内容选择或上传封面图。",
  CONTENT_LIBRARY_EDITOR_EXPORT_DIALOG_DESC: "使用受支持的格式导出当前内容正文。",
  CONTENT_LIBRARY_EDITOR_IMPORT_DIALOG_DESC: "从受支持的源格式替换当前内容正文。",
  CONTENT_LIBRARY_EDITOR_LOADING_TITLE: "正在加载内容编辑器",
  CONTENT_LIBRARY_EDITOR_SEARCH_DIALOG_TITLE: "搜索内容",
  CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER: "未命名页面",
  CONTENT_LIBRARY_EMPTY_TABLE: "没有页面、区块或记录",
  CONTENT_LIBRARY_FILTER_FIELD_CONTENT_TYPE: "内容模型",
  CONTENT_LIBRARY_NO_ACCESS_DESC:
    "你可以查看内容并打开预览。需要新建、编辑、归档或删除页面、区块或内容条目时，请让工作空间管理员开启内容管理权限。",
  CONTENT_LIBRARY_PREVIEW_FIELD_CONTENT_TYPE: "内容模型",
  CONTENT_LIBRARY_PREVIEW_PANEL_DESC: "先快速查看这个页面、区块或内容条目，再决定是否进入编辑器。",
  CONTENT_LIBRARY_PREVIEW_STRUCTURED_NEXT_DESC: "确认基本信息后，从字段入口编辑结构化内容。",
  CONTENT_LIBRARY_PREVIEW_SUMMARY_EMPTY_STRUCTURED: "此结构化内容还没有摘要。",
  CONTENT_LIBRARY_PUBLISH_NO_ACCESS_DESC:
    "你可以继续编辑草稿。需要发布这个页面、区块或内容条目时，请让工作空间管理员开启发布权限。",
  CONTENT_LIBRARY_PANEL_TITLE: "工作台视图",
  CONTENT_LIBRARY_RECORD_DRAWER_TITLE: "内容摘要",
  CONTENT_LIBRARY_ROLE_ARTICLE: "长文页面",
  CONTENT_LIBRARY_ROW_ACTIONS: "内容操作",
  CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_ARTICLE: "这个长文页面还没有描述。",
  CONTENT_LIBRARY_ROW_UNTYPED: "未选择内容模型",
  CONTENT_LIBRARY_SEARCH_PLACEHOLDER: "搜索页面、区块和内容条目",
  CONTENT_LIBRARY_SECTION_BY_TYPE: "按内容模型",
  CONTENT_LIBRARY_TABLE_COL_CONTENT_TYPE: "内容模型",
  CONTENT_MODELS_CREATE_AI_CHAT_EMPTY:
    "描述你想创建的内容模型。例如：“创建一个客户案例内容模型，包含标题、Logo、成果数据和行动号召字段。”",
  CONTENT_MODELS_CREATE_AI_PROMPT_CUSTOMER_STORIES_TEXT:
    "创建一个用于营销网站的客户案例内容模型。应包含公司 Logo、引用语、客户姓名、职位、成果指标、行动号召文案和链接，并可发布到网站列表页面。",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_CHECKLIST_LABEL: "让 Agent 创建内容前的检查项",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_FIELD_SCHEMA_TITLE: "字段设置",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_RELEASE_SOURCE_TITLE: "发布设置",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_ROUTE_SURFACE_TITLE: "页面地址与编辑方式",
  CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_STABLE_KEYS_TITLE: "唯一标识",
  CONTENT_MODELS_BLUEPRINT_NEXT_READY:
    "当前结构已准备好承载站点内容。可继续完善字段，或让 Agent 根据这些模型创建页面、区块和内容条目。",
  CONTENT_MODELS_CREATE_MODEL_TYPE_TITLE: "内容结构",
  CONTENT_MODELS_FIELD_MODEL_KIND: "内容结构",
  CONTENT_MODELS_KIND_COLLECTION_TYPE: "内容集合",
  CONTENT_MODELS_SETTINGS_CAPABILITY_HAS_SLOTS_DESC: "允许将可复用区块放到指定的页面内容区域。",
  CONTENT_MODELS_TAB_EDITORS: "编辑方式",
  CONTENT_STRUCTURED_SURFACE_FIELDS_CHANGE_SUMMARY: "更新结构化内容字段。",
  CONTENT_STRUCTURED_SURFACE_NEXT_DESC:
    "结构化内容的日常维护仍在内容库中完成。返回内容库后，可从“编辑主要字段”继续补充内容。",
  CONTENT_STRUCTURED_SURFACE_TITLE: "结构化内容",
  CONTENT_STRUCTURED_SURFACE_FIELD_MODEL: "内容模型",
  CONTENT_SURFACE_BOUNDARY_ITEM_CAPABILITIES: "当前内容支持的功能",
  CONTENT_TYPE_ARTICLE_NAME: "长文页面",
  CONTENT_TYPE_CATEGORY_DESC: "适合用于分类页面、区块和其他内容。",
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
      /\bBy type\b/i,
      /\bCurrent template type\b/i,
      /\bNew Article\b/i,
      /\bSearch article\b/i,
      /\bArticle\b/,
      /\bContent Views\b/i,
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
      /模板类型/,
      /长文条目/,
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
