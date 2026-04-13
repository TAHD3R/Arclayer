---
name: arclayer-frontend-design
description: Apply Arclayer's frontend design system, layout guardrails, and product-copy rules. Use when building or editing user-facing UI in apps/admin, apps/portal, apps/studio, packages/ui, or when writing labels, descriptions, empty states, dialogs, onboarding text, and other frontend copy.
---

# Arclayer Frontend Design

## Overview

Use this skill to keep Arclayer frontend work aligned with the repo's visual language and product-writing standards. Treat it as the direction-setting skill for design-sensitive frontend tasks: it constrains page hierarchy, surface composition, component styling, and copy tone before implementation details are chosen.

## When To Use

Use this skill whenever work touches any of the following:

- UI in `apps/admin`, `apps/portal`, `apps/studio`, or `packages/ui`
- page shells, panels, rails, dialogs, popovers, command menus, forms, tables, or settings surfaces
- tokens, theming, typography, spacing, color usage, hover/selected/focus states
- design-sensitive React/Vite/Vike work where layout and hierarchy matter
- any user-facing copy: labels, descriptions, helper text, empty states, error text, onboarding text, CTA copy, settings copy
- any task where there is a risk of inventing decorative UI, over-nesting surfaces, or leaking internal implementation truth into product copy

Use this skill together with implementation-focused frontend skills when needed:

- pair with `karpathy-guidelines` by default for non-trivial code changes
- pair with `tailwind-design-system` for token and utility work
- pair with `shadcn` for registry/component mechanics
- pair with `vercel-composition-patterns` or `vercel-react-best-practices` when component API or React structure is the main problem

This skill wins on direction. Other frontend skills win on implementation mechanics.

## Workflow

### 1. Establish The Product Surface

- Identify the actual surface type first: page shell, dialog, side rail, command surface, dense table, settings panel, auth screen, or empty state.
- Decide what the dominant region is. A screen without one dominant region usually turns into card soup.
- Keep the page canvas quiet. Use surfaces to create hierarchy, not background tricks.

### 2. Constrain The Visual Direction Before Coding

Read the relevant references before implementing:

- `references/visual-language.md` for color, typography, spacing, and atmosphere
- `references/layout-and-surfaces.md` for hierarchy, shells, panel structure, and anti-patterns
- `references/product-copy.md` for all user-facing writing and banned copy patterns

If the task is style-sensitive, align against the current live implementation before inventing a new pattern.

### 3. Compose The Surface With Discipline

- Prefer one main surface layer and one support layer.
- Add a second nested container only when it introduces meaningful grouping.
- Avoid card-inside-card-inside-card compositions unless each layer has a different responsibility.
- Use blue for action and selection only; do not tint the entire experience blue.
- In dark mode, build hierarchy with black canvas plus charcoal surfaces plus borders, not gradients and glow.

### 4. Write Product Copy, Not Engineering Commentary

- Write from the user's task, not from system architecture.
- Prefer short, direct, product-facing language.
- Do not explain internal data-model limitations in normal UI copy.
- Do not add fake precision or implementation disclaimers to make incomplete data sound sophisticated.
- If data is unavailable, say it plainly and calmly.

### 5. Review Before Finishing

Before finalizing any frontend change, check:

- Is there one obvious primary action?
- Is the hierarchy carried by surfaces rather than nested decoration?
- Does the page avoid unnecessary cards and subcards?
- Does dark mode feel black and charcoal rather than blue and foggy?
- Does every label and description sound like product copy instead of internal commentary?
- Would a user understand the screen quickly without needing domain backstory?

## Non-Negotiable Rules

- Do not build card farms. A large page should not become a stack of unrelated rounded rectangles.
- Do not solve weak hierarchy by adding more containers.
- Do not use decorative gradients, glow, glassmorphism, or ambient blue haze.
- Do not write copy that sounds like an engineer narrating the schema.
- Do not write copy that explains "global perspective", "creator admin managed count", "current build wiring", or similar internal framing in normal product UI.
- Do not surface raw implementation truth when a simpler product-facing truth exists.
- Do not add labels and descriptions that merely restate the obvious.
- Do not use tiny text to make dense interfaces fit.

## Banned Copy Patterns

Avoid copy in these shapes:

- architecture-first orientation: "先从 Arclayer 的全局视角进入，再跳转到你要操作的工作空间。"
- role-and-schema narration: "这里统计你当前作为 creator admin 管理的工作空间数量。"
- implementation-gap exposition: "细粒度用量计量尚未在这个构建中接入。当前唯一真实的账号级信号仍是工作空间数量，而不是伪造出来的套餐图表。"

Replace them with product-facing alternatives:

- "选择一个工作空间继续。"
- "你当前可访问的工作空间"
- "套餐与用量数据暂不可用。"

When a clearer, shorter version exists, use it.

## References

Load only the references needed for the task:

- `references/visual-language.md`
- `references/layout-and-surfaces.md`
- `references/product-copy.md`

If exact live tokens, utilities, or component contracts matter for the task, inspect the live repo implementation after applying this skill's direction.

## Resources

### references/
Reference documents distilled from Arclayer's design language and frontend UI conventions.
