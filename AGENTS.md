# Faizan Body Project Guidelines & Rules

## 1. Zero Dummy Data Rule (Strict)
- **NEVER** insert, seed, or hardcode dummy/test data in any models, migrations, seeds, or services.
- All datasets, tables, and in-memory fallbacks must start completely empty (`[]`).
- All records must come directly from real user entries.

## 2. Zero Data Loss Guarantee (Strict)
- **NEVER** drop tables, truncate tables, or delete production/database data during code updates or schema migrations.
- When modifying database schemas:
  - Only safe additive changes are permitted (`ALTER TABLE ... ADD COLUMN ...`).
  - Existing columns, rows, and relationships must be preserved 100%.
  - Default values must be provided for new fields to avoid breaking existing records.
