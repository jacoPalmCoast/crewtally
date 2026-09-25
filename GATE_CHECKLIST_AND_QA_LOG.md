# Gate checklist and QA log

Run this at the end of every phase. A phase isn't done until every box is ticked. "The Agent said it's done" is not a tick.

## 1. Tests on a fresh start
- [ ] The Agent pasted `npm run test` output: DB, server and mobile suites, with counts and zero failures.
- [ ] The Agent restarted the API and Expo, and pasted clean startup lines.
- [ ] No test was skipped, deleted, loosened or marked `.only`. Ask: "List any test you changed or removed in this phase and why."
- [ ] `db/tests/01`–`05` still pass unchanged.

## 2. Proof, not prose
- [ ] Every item in the phase's "Proof to paste" section is pasted as real code or output.
- [ ] Anything the Agent calls "already done" has its code pasted.

## 3. Independent review (me)
- [ ] Pushed to GitHub from Replit's Git pane.
- [ ] Sent me the repo link and the phase number.
- [ ] I return **PASS**, or a findings list with severity (Blocker / Major / Minor).
- [ ] Every Blocker and Major is fixed and re-reviewed. Minor items are fixed, or recorded below as won't-fix with a reason.

What I check every time:
- every new route uses the session's workspace, and never a workspace id from the request;
- another owner's ids return 404;
- money writes only through the database functions;
- no floats for money;
- migrations additive, with the checksum guard intact;
- test bodies assert real values and the failure cases, not just a 200;
- no secrets, names or amounts in logs;
- honest wording in the UI and PDFs.

## 4. On your phone
- [ ] Every item in the phase's "Try it on your phone" list works.
- [ ] At the largest text size, the new screens are usable.
- [ ] Dark mode on the new screens looks right.

## 5. Decision
- [ ] Done → paste the next phase.
- [ ] Not done → paste the findings back to the Agent with: "Fix these findings. Keep all invariants in replit.md. Re-run the gate. Do not start the next phase."

---

## QA log

| Date | Phase | Suites (db/server/mobile) | Review verdict | Phone check | Findings (B/M/m) | Done? |
|---|---|---|---|---|---|---|
| 2026-09-24 | P0 | 8 DB files / 32 server / 8 mobile | PASS | PASS — Expo Go opens; four tabs; dark mode follows system; Diagnostics API status ok; nothing cut off at largest accessibility text size | Fixes A–E applied; see notes below | PASS |
| | P1 | | | | | |
| | P2 | | | | | |
| | P3 | | | | | |
| | P4 | | | | | |
| | P5 | | | | | |
| | P6 | | | | | |
| | P7 | | | | | |
| | P8 | | | | | |

### Phase 0 — 2026-09-24

- **Result:** PASS (review and owner's iPhone check).
- **Tests:** 8 DB files, 32 server tests, 8 mobile tests.
- **Fixes:** A–E applied.
- **Deviations:** Project uses the `artifacts/` folder layout and the `/api/v1` API prefix. The Phase 6 public page must be served at `/r/:token` outside `/api`.
- **Open items:** React Native DevTools reports a `libdbus-1.so.3` warning; add real-error tests for `55000` in Phase 2 and `40001` in Phase 3.

### Findings

| # | Phase | Severity | Finding | Action | Status |
|---|---|---|---|---|---|
| | | | | | |

### When the Agent gets stuck
- It's looping, or says it's done when the tests show otherwise: stop it, reload the page, and paste:
  > "Stop. Paste the current `npm run test` output and `git status`. Do not change code until I reply."
- It wants to change `db/schema.sql`, a money function, or a provided test: the answer is no. Ask what problem it's trying to solve, and bring that to me.
- It offers extra features: decline. "Stay in scope for this phase."
