---
name: Credential idempotency hashing
description: Prevent offline guessing of codes from persisted idempotency request hashes.
---

Never put a raw low-entropy code into an unkeyed idempotency request hash, even when the database never stores the code itself. Transform the code with the server's CODE_PEPPER HMAC first; transform high-entropy invitation tokens with their token hash before request hashing.

**Why:** Independent review found that an unkeyed SHA-256 of an email/code request could be reproduced by enumerating six-digit codes, bypassing the pepper protecting the invitation record. Checking only that raw credentials are absent from stored JSON does not catch this.

**How to apply:** For any credential-accepting route, including later email-code and account-linking work, hash only a credential-digest form with the authenticated actor and request identity. Regression tests must read the persisted request hash and verify the expected peppered form, not merely absence of raw strings.