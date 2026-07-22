# Arclayer Design Language

## 1. Visual Theme & Atmosphere

Arclayer should feel like a serious product workspace: composed, intelligent, and low-noise. It is not a blank notebook, not a collaboration toy, and not a glossy SaaS landing page disguised as an admin panel. The interface should feel trustworthy before it feels stylish. When people open the product, they should immediately sense structure, hierarchy, and intent.

The light theme is built on a soft neutral-gray canvas with white work surfaces, cool neutral text, and restrained blue emphasis. It is cleaner and more technical than Notion's warm-paper calm, but still soft enough to avoid the sterile feel of generic enterprise dashboards. Surfaces are controlled. Borders are present but never heavy. Blue appears as a deliberate action signal, not as decoration.

The dark theme is the sharper half of the system. It begins from a true black background (`hsl(0 0% 0%)`) and builds hierarchy with charcoal planes rather than ambient gradients. Panels are dark graphite, not navy fog. Hover states brighten structure rather than tint the whole page. The result should feel precise and confident, like instruments floating on a black stage, not a glowing cyberpunk dashboard.

Typography uses one platform-native UI family for both hierarchy and working text. The stack prioritizes each platform's native Chinese face so mixed Chinese and Latin text keeps consistent weight, baseline, and rendering quality. Hierarchy comes from size and weight rather than switching proportional typefaces; monospace remains reserved for code, identifiers, and diagnostics.

What makes Arclayer distinctive is this balance:
- calmer than Slack
- more technical than Notion
- less decorative than Linear-style marketing systems
- more deliberate than default Tailwind dashboards

**Key Characteristics**
- Soft neutral-gray canvas with white work surfaces in light mode
- True black canvas in dark mode
- Blue reserved for action, selection, and links
- Charcoal cards and popovers in dark mode instead of tinted haze
- One platform-native UI family for headings and body text
- Compact but readable spacing
- Soft borders in light mode, clearer boundaries in dark mode
- Motion used for confirmation and orientation, never spectacle

### Brand Mark

The Arclayer mark is the **Arc Weave**: four organic arc-stone pieces interlocked into one continuous core. Each piece represents a composable content or design layer; their woven relationship represents an AI-native system that coordinates those layers without flattening their individual structure.

- Preserve the four-piece rotational structure and rounded inner chambers; do not collapse the mark into a letter, generic clover, or single circular ring.
- The four-piece core is the primary mark. Larger fields may repeat the same arc-stone module as a secondary brand pattern, but dense fields must not replace the compact product icon.
- Keep the primary mark visually continuous and monochrome. Internal texture and explicit grout lines belong only to illustrative brand applications, not the product icon.
- Use the near-black mark (`#1D1D1F`) on light surfaces and the soft-white mark (`#F5F5F7`) on dark surfaces.
- Use the slightly lighter optical profile on dark surfaces so the luminous mark does not appear heavier than its near-black counterpart.
- Keep the symbol and wordmark monochrome. Gradients, shadows, outlines, and multicolor layer diagrams do not belong in the primary brand assets.
- Use the standalone mark for favicons and compact navigation; use the full wordmark for authentication, invitations, and expanded product chrome.

## 2. Color Palette & Roles

Arclayer is a semantic system first. Color names should describe role and behavior, not decoration.

### Primary

- **Canvas Gray** (`hsl(220 14% 97%)`): page background, auth background, broad shells
- **Surface White** (`hsl(0 0% 100%)`): cards, popovers, headers, and contained work areas
- **Canvas Black** (`hsl(0 0% 0%)`): dark page background, large app canvas
- **Action Blue** (`hsl(211 100% 45.9%)`): primary CTA, focused selection, active emphasis
- **Action Blue Dark** (`hsl(211 100% 60%)`): primary CTA in dark mode

### Text Scale

- **Primary Ink** (`hsl(230 5.7% 20.8%)`): strongest text in light mode
- **Secondary Ink** (`hsl(237 8% 43.9%)`): descriptions, helper text, subdued labels
- **Tertiary Ink** (`hsl(229 10% 56%)`): metadata, timestamps, table support text
- **Quaternary Ink** (`hsl(229 15% 70%)`): placeholders, disabled text, low-importance detail

- **Primary Ink on Dark** (`hsl(0 0% 92%)`): strongest text in dark mode
- **Secondary Ink on Dark** (`hsl(0 0% 70%)`): descriptions and support text
- **Tertiary Ink on Dark** (`hsl(0 0% 55%)`): quiet metadata
- **Quaternary Ink on Dark** (`hsl(0 0% 40%)`): disabled or background-support text

### Surface System

#### Light surfaces
- **Card White** (`hsl(0 0% 100%)`): cards, contained work areas, form sections
- **Popover White** (`hsl(0 0% 100%)`): menus, dialogs, command panels
- **Muted Surface** (`hsl(220 12% 94%)`): grouped tool areas, low-emphasis containers
- **Accent Surface** (`hsl(220 10% 90%)`): neutral hover, active rows, chrome hover zones
- **Sidebar Surface** (`hsl(220 12% 94%)`): stable navigation plane separated from the page canvas

#### Dark surfaces
- **Card Charcoal** (`hsl(0 0% 8%)`): elevated panels, cards, drawers
- **Popover Charcoal** (`hsl(0 0% 8%)`): command menus, dialogs, dropdowns
- **Muted Dark Surface** (`hsl(0 0% 10%)`): grouped controls, passive containers
- **Accent Dark Surface** (`hsl(0 0% 14%)`): hover and pressed neutral background
- **Sidebar Charcoal** (`hsl(0 0% 5%)`): navigation plane separated from the black canvas

### Selection & Highlight Blue

- **Primary Hover** (`hsl(209 100% 36.3%)`)
- **Primary Selected** (`hsl(211 100% 90%)`)
- **Primary Selected Hover** (`hsl(211 92.9% 83.5%)`)
- **Primary Highlighted** (`hsl(212 100% 97.1%)`)
- **Primary Surface** (`hsl(225 46.2% 94.9%)`)

- **Primary Hover Dark** (`hsl(211 100% 70%)`)
- **Primary Selected Dark** (`hsl(211 60% 20%)`)
- **Primary Selected Hover Dark** (`hsl(211 60% 26%)`)
- **Primary Highlighted Dark** (`hsl(211 50% 14%)`)
- **Primary Surface Dark** (`hsl(211 40% 12%)`)

### Semantic States

- **Positive** (`hsl(155 100% 26.1%)` light / `hsl(155 80% 45%)` dark): success, publish, completed states
- **Negative** (`hsl(351 66.9% 53.7%)` light / `hsl(351 70% 60%)` dark): destructive actions and critical errors
- **Warning** (`hsl(48 100% 50%)` light / `hsl(48 100% 60%)` dark): caution and warning surfaces
- **Link** (`hsl(208 72.4% 44.1%)` light / `hsl(210 90% 65%)` dark): inline links and navigational text accents

### Borders & Rings

- **Layout Border Light** (`hsl(220 10% 88%)`): large structure, shell separation
- **UI Border Light** (`hsl(229 16.5% 79.8%)`): input shells, compact control boundaries
- **Layout Border Dark** (`hsl(0 0% 16%)`): large structural separation on black
- **UI Border Dark** (`hsl(0 0% 30%)`): card edges, menus, active boundaries
- **Input Edge Dark** (`hsl(0 0% 22%)`): field shells and interactive boundaries
- **Focus Ring** (`hsl(211 100% 45.9%)` light / `hsl(211 100% 60%)` dark): keyboard focus and active precision

### Color Principles

- Blue should never become the ambient mood of a page.
- The canvas should stay neutral; structure comes from surfaces.
- Dark mode should feel black plus charcoal, not black plus blue haze.
- Semantic colors belong to meaningful states, not decorative accents.
- If a screen feels colorful before it feels structured, the design is drifting.

## 3. Typography Rules

### Font Family

- **Heading / Body / UI**: platform-native system UI stack
- **Chinese priority**: PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC
- **Monospace**: platform-native monospace stack

The same proportional stack handles headings, tables, filters, commands, forms, helper text, and body copy. This keeps mixed-language UI coherent and avoids downloading a Latin-only face that forces Chinese text into a visibly different fallback. Weight and scale carry hierarchy; monospace is a semantic exception for technical values.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Scene Title | System UI | 32px (2rem) | 700 | 1.25 | -0.02em | Login titles, major page titles, large state headings |
| Section Title | System UI | 24px (1.5rem) | 600 | 1.333 | -0.015em | Primary page sections and major panels |
| Block Title | System UI | 18px (1.125rem) | 600 | 1.444 | -0.01em | Cards, side panels, modal headers |
| Minor Title | System UI | 16px (1rem) | 600 | 1.4 | 0 | Compact sections and grouped controls |
| UI Headline | System UI | 16px (1rem) | 600 | 1.4 | 0 | Buttons, tabs, active labels, strong field headers |
| Body | System UI | 16px (1rem) | 400 | 1.5 | 0 | Standard reading text |
| Support | System UI | 14px (0.875rem) | 400 | 1.45 | 0 | Helper text, descriptions, compact explanations |
| Dense Body | System UI | 14px (0.875rem) | 400 | 1.45 | 0 | Menus, command items, settings detail, dense UI |
| Caption | System UI | 14px (0.875rem) | 500 | 1.45 | 0 | Metadata, tags, hints, emphasized small text |
| Mono | System monospace | 12px-14px | 400-500 | 1.4 | 0 | Code values, shortcuts, diagnostics |

### Typography Principles

- Start most product UI at 14px or 16px.
- Use size and weight for hierarchy instead of switching proportional font families.
- Let size changes be modest; let weight and spacing carry rhythm.
- Avoid text smaller than 14px in normal product UI.
- Avoid uppercase noise, wide tracking, and overly compressed display treatments.
- If a surface is dense, reduce spacing before reducing font size.

## 4. Component Stylings

### Buttons

**Primary**
- Background: Action Blue / Action Blue Dark
- Text: white
- Padding: 8px 16px
- Radius: 6px
- Border: transparent
- Hover: shift to hover blue, no theatrical lift
- Use: save, continue, confirm, create

**Secondary**
- Background: muted or accent surface
- Text: primary ink
- Padding: 8px 16px
- Radius: 6px
- Border: 1px solid UI border when needed
- Use: secondary actions that remain clearly interactive

**Ghost**
- Background: transparent
- Text: primary ink or secondary ink
- Hover: neutral surface highlight
- Use: low-emphasis actions, toolbar controls, contextual actions

**Destructive**
- Background: negative
- Text: white
- Hover: slightly deeper red or higher contrast edge
- Use: irreversible destructive actions only

### Cards & Containers

- Background: Card White / Card Charcoal
- Border: layout or UI border depending on density
- Radius: 10px for regular cards, 20px for large dialogs or hero panels
- Shadow in light mode: restrained, mostly `0 1px 3px rgba(0,0,0,0.1)` to `0 8px 16px rgba(0,0,0,0.1)`
- Shadow in dark mode: minimal; rely on border and contrast first
- Hover: structure becomes clearer, never glossy

Cards should feel like work surfaces, not decorative tiles. In light mode they should barely rise off the canvas. In dark mode they must visibly separate from black, otherwise the whole interface collapses into one layer.

### Inputs & Forms

- Background: white in light mode, dark surface in dark mode
- Text: primary ink / primary ink on dark
- Border: dedicated input edge, never invisible
- Radius: 6px
- Padding: visually comfortable, never cramped
- Placeholder: tertiary or quaternary text only
- Focus: ring plus border/surface change

Inputs should feel contained and tactile. A field should always read as an object with edges, not just text floating over the page.

### Navigation

- Navigation should feel stable and quiet
- Selected states should be obvious without becoming giant blue pills
- Hover states should use neutral surfaces first, blue second
- Icons should support scanning, not dominate it
- Page chrome should not compete with the page itself

### Command Menus & Popovers

- Background: Popover White / Popover Charcoal
- Radius: 10px
- Border: visible in both themes
- Text size: 14px
- Keyboard hints: caption treatment, secondary emphasis
- Selected row: blue-selected or neutral-accent depending on context

Command surfaces should feel instrument-like: crisp, narrow, confident, and easy to parse quickly.

### Tables & Dense Surfaces

- Row height should feel compact but breathable
- 14px dense body text is the floor
- Column labels should feel structured, not loud
- Hover, selected, and sticky states must remain predictable
- Borders and spacing should help scanning more than background fills

### Tags & Badges

- Use 14px or 12px only when the badge is genuinely secondary
- Radius can be 9999px for status pills or 4px for compact semantic chips
- Filled semantic badges should be used sparingly
- Neutral badges are often better than colorful ones for routine metadata

## 5. Layout Principles

### Spacing System

- `2px`
- `4px`
- `8px`
- `12px`
- `16px`
- `20px`
- `24px`
- `32px`
- `40px`
- `48px`
- `64px`
- `80px`

This is a practical system, not a decorative one. It should make dense surfaces feel ordered rather than airy for the sake of airiness.

### Usage Ranges

- **2-8px**: icon gaps, chip internals, micro-adjustments, shortcut labels
- **8-16px**: buttons, input internals, compact toolbars, small stacked controls
- **16-24px**: form groups, card padding, section internals, settings rows
- **24-40px**: pane spacing, section separation, content rhythm
- **48-80px**: major scene spacing, auth layout breathing room, large screen structure

### Grid & Container Thinking

- Wide admin screens should still have one dominant reading axis
- Secondary rails support the task; they should not fight the main pane
- Large empty canvas space should feel intentional, not accidental
- Use surface changes to establish hierarchy before inventing layout tricks

### Whitespace Philosophy

- White space separates intent, not just blocks
- Important regions need more air than routine controls
- Dense does not mean compressed everywhere
- Quiet canvas plus controlled surfaces is the core compositional move

## 6. Radius, Borders & Elevation

### Radius Scale

- **4px**: inputs, buttons, compact controls
- **8px**: cards, menus, popovers, command surfaces
- **16px**: sheets, large panels, dialogs
- **9999px**: badges and pills when the pattern truly calls for it

Arclayer should not use a dozen corner styles. The system works because it stays short.

### Border System

- **Soft structural border**: large layout separation, shell edges, table divisions
- **UI border**: control outlines, card edges, popover frames
- **Input edge**: field shells that need stronger definition

Light mode borders should feel quiet and disciplined. Dark mode borders should work harder, because on a black canvas a missing edge is a missing layer.

### Elevation Levels

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | no shadow, no visible border | large page canvas, uninterrupted backgrounds |
| Structural | soft border only | major page regions and low-emphasis divisions |
| Surface | border + restrained shadow | cards, panels, toolbar groups, contained forms |
| Floating | clearer border + stronger contrast | menus, dialogs, popovers, command panels |
| Focus | visible ring plus boundary shift | keyboard focus and active precision moments |

### Elevation Philosophy

Arclayer should not rely on cinematic shadows. In light mode, depth comes from subtle shadow plus border. In dark mode, depth comes from black versus charcoal, then border, then only a small amount of shadow if needed. If a dark surface needs a big blur to be visible, the surface colors are wrong.

## 7. Motion & Interaction

### Duration

- **70ms**: opacity shifts, tiny icon feedback, micro-state changes
- **100ms**: hover transitions, chip states, compact interactions
- **150ms**: productive movement, panel changes, dropdown open/close
- **250ms**: expressive but justified emphasis
- **400ms**: rare and intentional entrance moments only

### Easing

- **Enter**: `cubic-bezier(0, 0, 0.35, 1)`
- **Exit**: `cubic-bezier(0.4, 0, 1, 1)`
- **Transition**: `cubic-bezier(0.4, 0, 0.2, 1)`
- **Emphasis**: `cubic-bezier(0, 0, 0.2, 1.4)`

### Motion Principles

- Motion should explain spatial change
- Similar components should move similarly
- Avoid bounce in routine product tasks
- Never hold task completion hostage to animation
- Reduced motion should still feel intentional, not broken

## 8. Responsive Behavior

### Breakpoints

| Name | Intent |
|------|--------|
| Mobile | one clear column, direct tasks, obvious CTA placement |
| Tablet | preserve structure, reduce parallel complexity |
| Desktop | use width for hierarchy, not decorative spread |
| Wide Desktop | allow larger scene breathing room without losing focus |

### Responsive Rules

- Collapse layouts by preserving meaning, not by blindly stacking everything
- Keep action clusters discoverable
- Maintain heading rhythm as width shrinks
- Let tables simplify, but do not destroy scannability
- Panels can become sheets on smaller screens if the mental model survives

## 9. Accessibility & States

### Focus System

- Every interactive element needs a visible keyboard focus treatment
- Focus should survive both white and black canvases
- Focus should feel designed, not incidental

### Interactive States

- **Default**: neutral, legible, structurally clear
- **Hover**: stronger surface or border signal, not decorative animation
- **Active / Pressed**: slightly tighter, deeper, or more focused treatment
- **Selected**: unmistakable without taking over the whole layout
- **Disabled**: quieter but still readable
- **Destructive**: explicit and serious, never playful

### Contrast

- Primary text should comfortably exceed WCAG AA
- Secondary text must remain readable on both white and charcoal
- Borders in dark mode must remain visible against black
- Never rely on color alone to convey meaning

### Semantics

- Heading structure should mirror the visual hierarchy
- Reading order should match interaction order
- Decorative imagery stays out of the accessibility tree
- Informative imagery needs meaningful alt text

## 10. UX Writing

Arclayer writing should feel like a capable operator speaking clearly.

### Voice

- direct
- calm
- concise
- human
- competent

### Writing Rules

- Use sentence case
- Put the bottom line first
- Prefer specific verbs over abstract product language
- Keep one clear CTA in each decision area
- Remove filler, hype, and apology loops
- Stay consistent with terminology
- Empty states should guide, not perform personality
- Error copy should clarify what happened and what the user can do next

## 11. Agent Prompt Guide

### Quick Color Reference

- Background light: `hsl(220 14% 97%)`
- Background dark: `hsl(0 0% 0%)`
- Card light: `hsl(0 0% 100%)`
- Card dark: `hsl(0 0% 8%)`
- Primary text light: `hsl(230 5.7% 20.8%)`
- Primary text dark: `hsl(0 0% 92%)`
- Secondary text light: `hsl(237 8% 43.9%)`
- Secondary text dark: `hsl(0 0% 70%)`
- Primary action blue: `hsl(211 100% 45.9%)`
- Primary action blue dark: `hsl(211 100% 60%)`
- Neutral hover light: `hsl(220 10% 90%)`
- Neutral hover dark: `hsl(0 0% 14%)`
- Border light: `hsl(229 16.5% 79.8%)`
- Border dark: `hsl(0 0% 30%)`

### Example Component Prompts

- "Create a login screen on a soft neutral-gray background with a calm product tone. Use a 32px system UI title, 16px support text, restrained borders, and blue only for the primary action."
- "Design a dark admin dashboard on a true black canvas with neutral charcoal cards (`hsl(0 0% 8%)`), strong readable text, low-noise chrome, and selected states that use deep blue rather than glow."
- "Build a command palette with a 10px radius, charcoal popover background, clear border, 14px system UI menu items, secondary keyboard hints, and a selected row that feels precise rather than loud."
- "Create a settings card with a white surface, soft border, 18px system UI section title, 16px body text, 16px-24px spacing rhythm, and inputs that feel contained and tactile."
- "Design a dense data table that stays readable: 14px system UI content, quiet column labels, restrained row hover, predictable selection states, and borders that support scanning without boxing everything in."

### Iteration Guide

1. Keep the page canvas quiet.
2. Use surfaces, not background effects, to build hierarchy.
3. Use blue for actions and selection, not for atmosphere.
4. In dark mode, think black plus charcoal plus border, not black plus gradients.
5. Use size and weight to announce hierarchy while keeping one proportional UI family.
6. If the screen feels impressive before it feels usable, simplify it.
7. If density makes the UI feel tiny, fix spacing and grouping before shrinking text.
8. If a state is not obvious without explanation, strengthen the visual contract.

## 12. What Arclayer Is Not

Arclayer should not become:

- a warm notebook UI
- a neon dark dashboard
- a glassmorphism control room
- a gradient-first SaaS marketing page
- a rainbow collaboration toy
- a tiny-text enterprise spreadsheet wall

## 13. One-Sentence Brief

Design Arclayer as a high-trust product workspace: softly layered in light mode, black and neutral-charcoal in dark mode, blue for action, one platform-native UI family for mixed-language clarity, and just enough motion to confirm the task without ever stealing attention.
