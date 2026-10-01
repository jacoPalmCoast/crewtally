---
name: Query cache test lifecycle
description: Why a passing Jest summary can still fail a command-based gate with TanStack Query fixtures.
---

Explicitly clear every test-owned QueryClient during teardown when its cache has been populated.

**Why:** TanStack Query's default five-minute garbage-collection timer can keep Node running after all assertions pass. A gate command timed out despite a green Jest summary; unmounting the test tree alone did not cancel that cache timer.

**How to apply:** For tests that populate query caches, pair fixture creation with cache cleanup in `afterEach` or `finally`. Confirm that the test command exits successfully; do not conceal leaked resources with `--forceExit`.