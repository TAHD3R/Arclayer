# Content Library Article Editor Design

**Date:** 2026-03-27
**Scope:** `/content/library` split preview editing, `/content/library/*` article page editing, Plate-based writing surface
**Status:** Direction locked before implementation

---

## Goal

Define the article editing surface for rebuilt content so writing-first content can be edited inside the Contents Library workbench without collapsing into the visual editor shell or a schema-first admin form.

This design locks:

1. how split preview editing and page editing relate
2. which parts of the article surface belong to the writing canvas versus page-level menus
3. how existing content version APIs should back autosave and publish flows

---

## Direction Summary

Article editing is a single editor core with two layouts:

- `Split Mode`: the full article editor embedded in the right-side preview panel beside the library workbench
- `Page Mode`: the same full article editor expanded into a dedicated page that still lives under the `Contents Library` navigation branch

These are not light/full variants. They are two working postures over the same document and the same save model.

The article editor should feel:

- writing-first
- calm and document-like
- structurally richer than plain rich text
- aware that the content ultimately powers a website

The article editor should not feel:

- like a generic CRUD detail form
- like a visual site-builder IDE
- like a separate product outside the content library

---

## Product Model

### 1. One editor core, two shells

The editor itself is one surface:

- same document schema
- same metadata contract
- same autosave model
- same publish workflow
- same toolbar/menu affordances

The shell differs:

- `Split Mode` optimizes for list + editor coexistence and quick context switching
- `Page Mode` optimizes for long-form writing and focus

### 2. Continuation from the library

`/content/library` remains the unified entry point.

From a library row:

- `Open` routes to `Split Mode`
- a second top-toolbar action in split mode routes to `Page Mode`

The library stays responsible for:

- listing and filtering content
- opening the right continuation surface
- preserving active views/search/filter context

It does not become a separate article management page tree.

### 3. Article editor remains under Contents Library

The article page editor should stay under the `/content/library` branch instead of moving to the visual editor shell.

Reasoning:

- the sidebar should stay active on `Content -> Contents Library`
- the page editor is a continuation surface of the library, not a separate authoring product
- returning to the workbench should preserve views and work context naturally

Recommended route direction:

- `/w/$workspaceId/content/library/$itemId/`

This keeps the editor clearly attached to the library branch while allowing a dedicated page component and search state.

---

## Writing Surface Structure

### Canvas hierarchy

The first visible hierarchy should be:

1. document toolbar
2. document header
3. document body

### Document header

The header should feel Notion-like while remaining compatible with website content metadata.

It contains:

- cover image area
- icon affordance
- title field
- summary/description field

#### Cover image and icon

These are structured fields, not body blocks.

Interaction:

- hovering the title/header zone reveals `Add icon` and `Add cover`
- they visually belong to the canvas header
- they are stored as metadata, not inside the Plate block tree

#### Title

The title remains a first-class structured field.

It should not be implemented as the first Plate block because:

- the content system needs a stable title for list identity and routing metadata
- autosave and publish workflows should not need to infer the title out of body content
- the editor can still render it as a document headline so it feels like part of the writing canvas

#### Summary / description

The summary is a directly editable second field below the title.

It belongs in the main authoring flow because:

- website-backed content needs a reusable excerpt/description
- writers should not have to open a settings panel to author it
- it is closer to the article’s visible content shape than to SEO-only metadata

### Document body

The body is implemented with Plate and should support:

- block-based editing
- slash command insertion (`/`)
- line-leading `+` insertion affordance
- drag handle per block
- drag-handle menu for block-level actions

Plate owns the body document engine, but it does not own the entire page shell or page-level settings menus.

---

## Toolbar and menus

### Split Mode toolbar

The split preview toolbar should stay minimal and utility-first.

Required controls:

- `Close split editor`
- `Open page editor` / maximize into full-page mode

Both must have tooltips.

The toolbar should not become a dense formatting ribbon. Body-level formatting belongs to Plate’s contextual controls.

### Document-level actions

The top-right menu (`...`) is the primary document settings/action surface.

This menu should contain inline items and submenus for:

- status
- visibility
- slug/path
- SEO
- duplicate
- delete
- history
- import/export

This is intentionally closer to Notion’s page menu than to a separate property inspector.

### Title hover controls

Hovering the header/title area should reveal only document-header actions:

- add icon
- add cover

Do not mix structural website settings such as SEO or visibility into the hover controls.

---

## Save and publish model

### Draft save model

The editor autosaves drafts.

This applies to both split and page mode.

The surface should show save state in chrome, for example:

- saving
- saved
- save failed

There should not be a primary manual `Save` button as the dominant writing action.

### Publish model

Publish remains explicit.

Publishing and updating a published article should be separate confirmed actions because:

- website content has public consequences
- autosave should only move the draft state forward
- publish/unpublish semantics should remain clear and auditable

### API alignment

The current backend already exposes canonical version workflows:

- save draft version
- patch draft version
- publish version

Current implementation truth:

- `fields_snapshot` stores structured item fields
- `presentations` stores document/presentation payloads such as `rich_text_document` and `seo`

The editor should build on this contract instead of inventing a second draft persistence model.

---

## Content metadata split

### In the main canvas

These belong directly in the article editor canvas:

- cover image
- icon
- title
- summary
- body

### In the document menu

These belong in the top-right page menu:

- status
- visibility
- slug/path
- SEO title/description and related SEO settings
- document operations such as duplicate/delete/history/import/export

### Not in the body tree

These should not be encoded as Plate blocks:

- slug
- status
- visibility
- SEO payload
- cover image metadata
- icon metadata

The body tree should stay focused on authorable document content.

---

## Split Mode and Page Mode responsibilities

### Split Mode

Split mode is not a reduced preview.

It should support the same article editing capability set as page mode, while optimizing for:

- keeping the library visible
- short editing loops
- fast switching across records

### Page Mode

Page mode is the same editor with more room and more focus.

It optimizes for:

- long writing sessions
- large documents
- reduced workbench distraction

This is closer to a focus/zen posture, not a separate editor product.

---

## First-slice implementation priorities

### Slice 1: route and shell

Build the dedicated article page route and shared editor shell without Plate.

This slice proves:

- route placement under the library branch
- split/page mode relationship
- toolbar actions and menu ownership
- save-state and publish-state chrome placeholders

### Slice 2: editor data contract

Wire frontend API/types for reading and updating article draft content via version snapshots and presentations.

This slice proves:

- how an article document is loaded
- how title/summary/body map to fields + `rich_text_document`
- how autosave interacts with draft versioning

### Slice 3: Plate integration

Mount Plate for the body editor with a minimal block set and slash insertion.

### Slice 4: document header interactions

Add cover/icon/title/summary interactions.

### Slice 5: document-level menu

Add status/visibility/slug/SEO menus and publish affordances.

---

## Explicit non-goals for the first implementation

Do not include in the first slice:

- full collaboration/comments/suggestions
- AI workflows
- complete SEO management UI
- complex media embedding flows
- parity with the visual editor shell
- a second lightweight preview-only editor

The first release goal is to establish the article editor architecture and editing posture correctly.
