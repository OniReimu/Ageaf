# Native Messaging Migration - Task Plan

**Canonical plan:** `docs/plans/2026-01-24-native-messaging-migration.md`

**Goal:** Add native messaging support to Ageaf while preserving HTTP dev mode and providing transport toggle + host availability UX.

**Current Phase:** Batch 2 Complete - Awaiting Feedback

**Next Actions:**
1. Wait for user feedback on Batch 2
2. Begin Task 6: Transport abstraction
3. Implement HTTP and Native transport layers

## Phases

| Phase | Status | Notes |
|-------|--------|-------|
| Task 0: Repo hygiene | ✅ complete | Branch: OniReimu/native-messaging |
| Task 1: Native messaging protocol | ✅ complete | Commit 3ca62c4 - protocol.ts + tests |
| Task 2: Job subscription helpers | ✅ complete | Commit 1be8ac6 - subscription API |
| Task 3: Native host entrypoint | ✅ complete | Commit 1c6c66f - stdin/stdout handler |
| Task 4: Runtime script + manifest | ✅ complete | Commit eb8078b - build infrastructure |
| Task 5: Background bridge | ✅ complete | Commit 3197c36 - extension bridge |
| Task 6: Transport abstraction | pending | HTTP/Native transport layer |
| Task 7: Options + UI | pending | Settings and host detection |
| Task 8: Manifest permission | pending | Add nativeMessaging permission |
| Task 9: Availability UX | pending | Native ping and status UI |
| Task 10: Packaging scaffolding | pending | macOS installer scripts |
| Task 11: E2E verification | pending | Manual testing checklist |

## Plan Deviations

None yet.

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| - | - | - |

## Stop Policy

`checkpoints-allowed` - Stop after each batch (3 tasks) for user feedback.
