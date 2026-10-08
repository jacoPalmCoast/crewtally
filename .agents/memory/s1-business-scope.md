---
name: S1 Business scope
description: User-approved interim restriction that overrides the original S1 brief's Business role expectations.
---

S1 domain routes retain HOME permissions and allow BUSINESS only for OWNER or ADMIN with money access. Other Business roles receive 404. This applies to the new domain routes, not existing identity/membership routes.

**Why:** The user chose “HOME + Business money managers” after a security review found that workspace-wide role gates alone let WORKERs read and write other workers' records. The Business brief defines LEAD scope by assigned jobs, but the job-lead mapping is deferred to a later migration; S1 prohibits new migrations.

**How to apply:** Preserve this interim restriction even where the original S1 brief mentions LEAD/WORKER route permissions. Do not enable their domain access using `role_can` alone or infer a LEAD's jobs from their optional worker record. Replacing the restriction belongs to an explicitly authorized Business scoping phase.
