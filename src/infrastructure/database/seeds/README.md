# Required static seeds (Stage 5A.6)

Infrastructure owns seed execution; this folder holds the **required static
catalog seeds** (MVP "tier 1") and the CLI that applies them. No feature
behaviour lives here, and nothing in the application/domain layers imports it.

## Files

| File | Responsibility |
|---|---|
| `required-seed-data.ts` | The pure datasets (stable ids, content). Storage-agnostic. |
| `required-seeds.ts` | `seedRequiredStatics(db, storage)` — idempotent upserts in dependency order + count verification. |
| `seed.ts` | `npm run db:seed` entrypoint: loads `.env`, opens a pool, runs the seeder, prints verified counts. |
| `required-seed-data.spec.ts` | DB-free structural checks on the datasets (run in `npm test`). |

## What gets seeded

| Dataset | Count | Notes |
|---|---|---|
| `categories` | 6 | Board columns, positions 1–6. |
| `questions` | 30 | Five per category at 100/200/400/600/800; `correctAnswer` is backend-only. |
| `presentation_topics` | 8 | Global catalog (≥ max supported teams); no `assignedTeamId`. |
| `qr_tools` | 6 | **Metadata only** — global `storageKey` `qr-tools/<id>.svg`, no `.svg` upload. |
| `shop_items` | 6 | Each wraps one QR tool (`qrToolId`); price > 0; no purchase-state fields. |
| `presentation_requirements` | 6 | Ordered; one optional (`isRequired = false`). |
| `evaluation_criteria` | 2 | Topic coverage + design, each 0–10. |

## Run

```bash
npm run db:migrate   # schema must exist first
npm run db:seed      # idempotent; verifies counts and prints a summary
```

See [../../../../docs/migrations-and-seeds.md](../../../../docs/migrations-and-seeds.md)
for the full workflow, env vars, idempotency, and clean-DB expectations.

## Scope boundaries

- **Idempotent:** stable ids + upsert on the primary key — re-running converges
  the DB to the seed definitions without duplicates and without deleting catalog
  rows (runtime foreign keys stay valid).
- **No runtime data:** `rooms`, `players`, `teams`, `board_cells`, `purchases`,
  `inventory_items`, `presentation_submissions`, `evaluation_scores`,
  `final_results` are never seeded.
- **No MinIO upload:** QR metadata is composed from config; placing the `.svg`
  objects in MinIO is a later sub-stage (5A.7).
- **No demo seeds:** none defined in this sub-stage.

## Content language

Player-facing strings (category/question/topic/requirement/criterion titles) are
in Russian to match the game ("Своя игра"). The planning docs fix the *structure*
(6 categories, 30 questions five-per-category by value, two evaluation criteria)
but not the literal wording, which is authored here.
