# Subtask Spec: Canonical Typed Creation And Bootstrap Alignment

## Goal

Repair the content creation path so new content items are created with canonical model truth, and align the Admin bootstrap flow so users must choose a real content model before continuing.

## Scope

- API create-item input schema and service enforcement
- Admin create-item payload typing
- bootstrap controller and step-one UI
- related admin/api tests
- bootstrap-facing locale copy required by this slice

## Acceptance

- `POST /content/items` cannot create a new model-less item
- unknown `modelKey` is rejected clearly
- bootstrap requires a selected real model before continuing
- no-model bootstrap state is explicit and human-readable
- current library entry handoff still routes to the item continuation path

## Validation

- `pnpm --filter @arclayer/api test:integration -- test_content_items_integration`
- `pnpm --filter @arclayer/admin test -- content-bootstrap`
