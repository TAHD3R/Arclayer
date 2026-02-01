## CelestialCMS Technical Development & Design Specification (v1.0)

### 1. Design Philosophy & Personality

The interactive soul of CelestialCMS is derived from Slack’s core principles, aimed at building a "human-centric and highly efficient" plugin-based management system.

* **Core Principle:** Strive for **Perspicuity**. Interfaces should be concise and clear, omitting unnecessary decoration to let users reach functional cores directly.
* **Voice & Tone:**
* **Confident:** Guide users through operations without being cocky.
* **Witty:** Maintain a sense of affinity, but strictly avoid being silly.
* **Conversational:** Speak like a human to a human; use contractions (e.g., "Don't") to increase relatability.
* **Intelligent:** Treat users as smart partners; avoid outdated Silicon Valley jargon like "Ninja" or "Rock star".


* **Inclusivity:** Strictly prohibit the use of exclusionary, discriminatory, or culturally appropriative language.


### 2. Visual & Typography Standards

Mapped based on provided HSL Tokens and Slack's visual guidelines.

#### 2.1 Color Mapping (Twitter Theme)

| Semantic Variable | HSL Value | Usage Description |
| --- | --- | --- |
| `--primary` | `203.8 88.2% 53.1%` | Twitter Blue; used for primary buttons, links, and active states. |
| `--background` | `0 0% 100%` (L) / `0 0% 0%` (D) | Minimalist base; use pure black in dark mode for maximum contrast. |
| `--card` | `180 6.6% 97.1%` | Plugin container background; creates a subtle hierarchy against the base. |
| `--destructive` | `356.3 90.5% 54.3%` | Error messages, deletions, and high-risk operations. |

#### 2.2 Typography System

Strictly control letter spacing and font weight according to Slack’s official manual.

* **Headlines (Larsseit):** Mapped to `--font-sans`.
* **H1:** `36px/38px`, Bold, Tracking: `-2px`.
* **H2:** `24px/28px`, Bold, Tracking: `-1px`.


* **Body (Open Sans):** Mapped to `--font-sans`.
* **P (Paragraph):** `15px/22px`, Regular, Tracking: `-10`.
* **CTA Text:** `15px/22px`, Bold, Tracking: `+20`.


* **Typesetting Constraint:** Always use **Sentence case** (only the first letter capitalized); strictly avoid all-caps in headlines or buttons.


### 3. Engineering Implementation

#### 3.1 Geometry Constraints

* **Radius:** Unified at `0.5rem`.
* **Border:** Use the 1px solid line defined by the `--border` variable to distinguish layers; do not use shadows (`--shadow-opacity: 0`).

```
:root {
  --radius-sm: 0.25rem;
  --radius: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
}
```

#### 3.2 Ant Design V6 Theme Configuration

```typescript
const themeConfig = {
  token: {
    colorPrimary: 'hsl(203.8863 88.2845% 53.1373%)',
    borderRadius: 0, // Enforce sharp corners
    fontFamily: 'Open Sans, sans-serif',
    colorBgContainer: 'hsl(180 6.6667% 97.0588%)', // Maps to --card
  },
  components: {
    Button: {
      fontWeight: 600, // Aligns with Slack CTA weight
      controlHeight: 32,
    },
    Card: {
      borderRadiusOuter: 0,
    }
  }
};

```

#### 3.3 TailwindCSS V4 Semantic Application

Utilize Tailwind's declarative classes to achieve Slack-style layouts:

* **Container:** `bg-card border border-border rounded-none`
* **Headline:** `font-sans font-bold tracking-[-1px] text-foreground`
* **Sidebar:** `bg-[var(--sidebar)] border-r border-border`

#### 3.4 Admin UI Interaction & Typography Rules (Enforced by Convention)

These rules keep the Settings experience consistent, readable, and easy to extend.

**Dialog / Sheet selection**

* Prefer **first-party** UI building blocks for Settings overlays (our own Sheet/Dialog implementations).
* Use Ant Design Sheet/Dialog **only when explicitly requested** (e.g. "use Antd Modal for this").
* When an overlay is used, it must be justified by complexity (many fields, multi-step flow, or high-risk confirmation).
  Otherwise prefer **inline expand/edit** patterns (Accordion-style).

**Typography baseline**

* The project baseline font size is **16px** for admin UI copy.
* Avoid `text-xs` / `text-sm` unless there is a clear reason (density constraints, secondary metadata, or a11y).
  If used, the PR must include a short rationale in the change summary.

**Ant Design sizing**

* Avoid passing `size="small"` to Ant Design components in admin UI by default.
  If `size="small"` is used, the PR must include a short rationale (space constraints, table/toolbars, or compact views).

**Voice & tone**

* Follow the "Design Philosophy & Personality" in all user-facing strings:
  concise, confident, conversational, and never overly technical or verbose.
* Prefer sentence-case and direct descriptions (avoid "Answer: ..." style copy).

### 4. Plugin Development Principles (Block Kit Logic)

CelestialCMS plugins should mimic Slack’s **Block Kit** logic to ensure UI consistency:

1. **Atomic Interaction:** All plugin actions must reflect semantic colors defined in HSL.
2. **Slot Consistency:** Plugin content padding must strictly follow multiples of `--spacing` (0.25rem).
3. **Accessibility (A11y):** Follow Slack guidelines; all interactive elements must have clear focus states and Aria labels.
