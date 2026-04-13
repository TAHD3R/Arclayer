# Arclayer Product Copy Rules

Use this reference for all user-facing frontend copy.

## Voice

Write like a capable product operator:

- direct
- calm
- concise
- clear
- competent

Do not write like:

- an engineer explaining the architecture
- a system prompt narrating hidden implementation truth
- a PM trying to sound profound
- a dashboard inventing fake precision

## Copy Principles

- Put the bottom line first
- Prefer specific verbs and concrete nouns
- Keep labels short
- Keep descriptions useful
- Use one clear CTA per decision area
- If data is unavailable, say it plainly
- If a user can act, tell them the next action directly

## What To Avoid

### 1. Architecture-first narration

Bad:

- "先从 Arclayer 的全局视角进入，再跳转到你要操作的工作空间。"

Better:

- "选择一个工作空间继续。"
- "进入一个工作空间以继续管理内容。"

### 2. Role/schema exposition

Bad:

- "这里统计你当前作为 creator admin 管理的工作空间数量。"

Better:

- "你当前可访问的工作空间"
- "工作空间数量"

### 3. Implementation-gap commentary

Bad:

- "细粒度用量计量尚未在这个构建中接入。当前唯一真实的账号级信号仍是工作空间数量，而不是伪造出来的套餐图表。"

Better:

- "套餐与用量数据暂不可用。"
- "更多套餐信息即将提供。"

### 4. Fake sophistication

Avoid copy that tries to sound precise by mentioning:

- internal data sources
- schema truth
- raw model boundaries
- build status
- wiring details
- "当前唯一真实的..."

If the user does not need that information to act, it should not appear in product UI.

## Labels And Descriptions

### Good labels

- short
- stable
- task-oriented

Examples:

- "新建内容"
- "选择工作空间"
- "保存更改"
- "导航与页脚"

### Good descriptions

- explain the outcome
- explain the consequence
- explain the next step

Examples:

- "选择一个工作空间继续。"
- "这些设置会影响站点导航的显示方式。"
- "保存后将立即应用到当前工作空间。"

## Empty And Error States

- empty states should guide, not perform personality
- errors should explain what happened and what the user can do next
- avoid apology loops and filler
- avoid "目前/当前构建/暂未接入" unless there is no cleaner phrasing

## Final Check

Before shipping copy, ask:

- Would a user understand this without knowing our architecture?
- Is this sentence helping the task, or merely narrating implementation truth?
- Can this be said in fewer words without losing meaning?
