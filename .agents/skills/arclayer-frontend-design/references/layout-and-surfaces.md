# Arclayer Layout And Surface Rules

Use this reference when composing page structure, panels, cards, rails, dialogs, and dense work areas.

## Surface Hierarchy

The page background is a canvas, not a content surface.

Preferred hierarchy:

1. page canvas
2. primary work surface
3. optional supporting surface
4. floating surface only when interaction requires it

This means:

- most pages should read as one main surface plus one support region
- a support rail or side panel must help the main task, not compete with it
- dialogs, menus, and command palettes are floating surfaces, not extra cards glued onto cards

## Card Discipline

Do not default to wrapping everything in cards.

Allowed:

- one card to contain a meaningful work area
- a smaller grouped region inside a card when it creates a real semantic subsection
- a floating popover or dialog above the page when interaction requires it

Avoid:

- card inside card inside card with no responsibility change
- page-level canvases filled by stacked subcards just to create visual interest
- one card per trivial metric when the information could live in a cleaner grouped layout
- turning every settings row into its own box

Use this test:

- If removing one surface does not change meaning, remove it.
- If two adjacent surfaces have the same purpose, merge them.
- If the page needs multiple nested shells to feel organized, the hierarchy is probably weak.

## Page Shell Thinking

- major pages need one dominant reading order
- page chrome should establish context quickly, then get out of the way
- secondary rails should stay supportive
- settings pages should feel systematic, not like dashboards
- dense admin tools are allowed, but composition still needs rhythm

## Dark Mode Rules

- background is true black
- cards and panels use charcoal surfaces
- borders do more work than in light mode
- hierarchy should come from layer contrast, not glowing shadows
- hover states should clarify structure instead of tinting whole sections

## Review Checklist

Before shipping a layout, ask:

- What is the main surface?
- What is the supporting surface?
- Is every nested container earning its place?
- Can hierarchy be understood without colored backgrounds?
- Does the page still look intentional if all shadows are reduced?
