# Arclayer Visual Language

Use this reference to set the visual direction of frontend work before coding.

## Atmosphere

- Light mode: true white canvas, cool neutral text, restrained blue emphasis
- Dark mode: true black canvas, charcoal surfaces, stronger borders, no ambient haze
- Overall tone: calm, technical, trustworthy, product-first

Arclayer should feel:

- calmer than Slack
- more technical than Notion
- less decorative than Linear-style marketing UI
- more deliberate than generic Tailwind dashboards

## Color Direction

- Blue is the action color, not the page mood
- Neutral surfaces create the hierarchy
- Semantic colors describe states, not decoration
- Dark mode should feel black plus charcoal plus border, not black plus gradient

### Key colors

- Canvas White: `hsl(0 0% 100%)`
- Canvas Black: `hsl(0 0% 0%)`
- Action Blue: `hsl(211 100% 45.9%)`
- Action Blue Dark: `hsl(211 100% 60%)`
- Card Charcoal: `hsl(220 15% 8%)`
- Accent Dark Surface: `hsl(220 15% 14%)`
- Primary Ink: `hsl(230 5.7% 20.8%)`
- Primary Ink on Dark: `hsl(220 15% 92%)`

## Typography Direction

- Poppins announces hierarchy
- Figtree does the work
- IBM Plex Mono is for code-like values and shortcuts only

### Type rules

- Start most UI at 14px or 16px
- Use Poppins for titles, section headers, auth headings, and scene labels
- Use Figtree for buttons, forms, menus, tables, descriptions, and labels
- Avoid going below 14px in normal product UI
- If a surface feels dense, reduce spacing before shrinking type

## Motion Direction

- Motion exists for confirmation and orientation
- Similar components should move similarly
- Avoid bounce in normal workflows
- Avoid decorative motion stacks
- Never make completion feel delayed by animation

## Anti-Patterns

- no ambient blue background
- no purple bias
- no glow-heavy dark mode
- no glassmorphism
- no decorative gradients to simulate hierarchy
- no oversized type for ordinary product surfaces
- no tiny text used to cram density into a weak layout
