---
name: Orval contract pitfalls
description: Non-obvious YAML and nested validation behavior in the API contract generator.
---

Do not use YAML merge keys (`<<`) to compose OpenAPI schema properties in this project. Ordinary aliases work; repeat properties or use supported OpenAPI composition instead.

**Why:** The installed Orval YAML loader treats a merge key as a literal property rather than expanding it. Generation and shared-library typechecking can succeed while producing incomplete request contracts.

**How to apply:** Inspect generated request fields after changing schema composition, and typecheck the consuming handlers, not just the generated libraries.

Top-level Zod `.strict()` does not reject unknown fields inside nested allocation or reversal objects. OpenAPI `additionalProperties: false` alone does not make Orval's default generated Zod objects strict.

**Why:** Unknown nested fields can otherwise be silently stripped, contrary to the declared request contract.

**How to apply:** Configure body strictness for the affected operations during generation and verify rejection of unknown nested fields through HTTP tests.
