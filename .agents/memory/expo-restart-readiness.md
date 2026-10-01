---
name: Expo restart readiness
description: Distinguish workflow/session-login success from actual Metro readiness after restarting Expo.
---

Confirm Metro startup, Expo Go mode, and QR generation after an Expo workflow restart; do not infer readiness from the workflow's running state or successful session login alone.

**Why:** A managed restart left the prior Expo child process holding its assigned port. The replacement logged in successfully but waited at an interactive port-change prompt while the old process continued serving the preview.

**How to apply:** If startup asks to use another port, verify that the occupying process is the stale Expo server for this mobile artifact before stopping it. Then restart the existing managed workflow, preserving the injected port and session-login command. Do not alter code/configuration, start a duplicate server, stop the API, or print credential-bearing process arguments.