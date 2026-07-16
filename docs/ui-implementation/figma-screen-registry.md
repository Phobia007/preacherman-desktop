# Preacherman Figma Screen Registry

Source of truth: Figma file `USA27mjAybt1oSFyhwwDaz`, read on 2026-07-16. The current file contains **53 pages**, all with a confirmed 1440×900 screen root. A root can be a Figma `FRAME` or `SECTION`; the registry preserves that distinction instead of inventing a frame ID.

The repository does not contain `preacherman-ui-all-55-pages.pdf`, so the PDF count cannot be independently reconciled in this round: **PDF 55页待补充核对**.

## Reconciliation with backend screen index

`docs/backend-handoff/02-screen-index.*` contains 55 historical entries. The current Figma file has no direct page for historical SCR-009 (conversation history), SCR-020 (external Skill import), or SCR-038 (second import-validation exploration), and adds the current unified Status page `514:201`. SCR-001, SCR-044, and several screen-root IDs also differ between the historical index and the current Figma structure. These are recorded as reconciliation notes, not silently rewritten.

Interaction states remain states of a shared product flow, not separate backend modules. The Demo Host exposes every current page in `/__screens`; only implemented entries are enabled.

The product flow does not navigate through every captured Figma frame as if it were a page. The literal trigger mapping for this batch is:

- `Status: live` click -> `287:637` State Trace.
- `current state: v 1.0.0` click -> `219:3` Current State detail. `287:714` is retained as the Figma click-cue reference, not a product route step.
- State figure hover/focus -> `281:374` tooltip state; State figure click -> `32:2` conversation.
- Non-empty conversation input + Enter -> `412:728` sent/reply state.
- `Turn into Task` records the local Demo action only. Its destination `38:2` remains Pending and is not implemented by this batch.
- Direct `/__screens/:screenId` access exists only for Demo QA and never appears in Surface Skin navigation.

## Current Figma pages

| # | Page ID | Page name | Screen root | Type | Backend | Flow | Implementation | QA |
|---:|---|---|---|---|---|---|---|---|
| 1 | 281:537 | home | 281:538 | FRAME | SCR-001* | FLOW-02/03/10 | Implemented | Accepted |
| 2 | 287:636 | home点击status | 287:637 | FRAME | SCR-002 | FLOW-02 | Implemented | Accepted |
| 3 | 287:713 | home点击current state | 287:714 | FRAME | SCR-004 | FLOW-02 | Implemented | Accepted |
| 4 | 219:2 | home点击current state详情 | 219:3 | FRAME | SCR-005 | FLOW-02 | Implemented | Accepted |
| 5 | 281:373 | home点击人模对话 | 281:374 | FRAME | SCR-006 | FLOW-03 | Implemented | Accepted |
| 6 | 7:102 | home对话 | 32:2 | FRAME | SCR-007 | FLOW-03 | Implemented | Accepted |
| 7 | 100:166 | home对话hover | 412:728 | FRAME | SCR-008* | FLOW-03 | Implemented | Accepted |
| 8 | 416:745 | home对话hover导出对话记录（待完成 | 416:746 | FRAME | SCR-010 | FLOW-03 | Pending | Pending |
| 9 | 7:106 | 工作区 | 38:2 | FRAME | SCR-011 | FLOW-04 | Pending | Pending |
| 10 | 493:469 | 工作区 等待中 | 493:653 | SECTION | SCR-012 | FLOW-04 | Pending | Pending |
| 11 | 502:659 | 工作区 任务完成后 | 502:660 | SECTION | SCR-013 | FLOW-04 | Pending | Pending |
| 12 | 503:728 | 工作区 任务完成后 2 | 503:729 | SECTION | SCR-014 | FLOW-04 | Pending | Pending |
| 13 | 503:796 | preacherman lab (adjust state) | 503:797 | FRAME | SCR-015 | FLOW-05 | Pending | Pending |
| 14 | 112:213 | preacherman lab | 112:214 | FRAME | SCR-016 | FLOW-06 | Pending | Pending |
| 15 | 412:382 | preacherman lab 2 | 412:551 | SECTION | SCR-017 | FLOW-06 | Pending | Pending |
| 16 | 412:564 | preacherman lab 2 hover | 412:565 | SECTION | SCR-018 | FLOW-06 | Pending | Pending |
| 17 | 7:103 | preacherman lab (create state) | 20:72 | FRAME | SCR-019 | FLOW-06 | Pending | Pending |
| 18 | 250:2 | state test hover前 | 487:194 | SECTION | SCR-021 | FLOW-08 | Pending | Pending |
| 19 | 493:373 | state test hover后 | 493:374 | SECTION | SCR-022 | FLOW-08 | Pending | Pending |
| 20 | 487:195 | state test 2 | 487:196 | SECTION | SCR-023 | FLOW-08 | Pending | Pending |
| 21 | 487:286 | state test 3 | 487:372 | FRAME | SCR-024 | FLOW-08 | Pending | Pending |
| 22 | 166:232 | preacherman lab skills页面 | 166:233 | FRAME | SCR-025 | FLOW-07 | Pending | Pending |
| 23 | 112:2 | preacherman lab skills页面 空白创建1 | 112:3 | FRAME | SCR-026 | FLOW-07 | Pending | Pending |
| 24 | 344:496 | preacherman lab skills页面 空白创建2 | 344:497 | FRAME | SCR-027 | FLOW-07 | Pending | Pending |
| 25 | 344:1158 | preacherman lab skills页面 空白创建3 | 344:1159 | FRAME | SCR-028 | FLOW-07 | Pending | Pending |
| 26 | 352:1992 | preacherman lab skills页面 空白创建4 | 352:1993 | FRAME | SCR-029 | FLOW-07 | Pending | Pending |
| 27 | 352:3019 | preacherman lab skills页面 空白创建5 | 352:3020 | FRAME | SCR-030 | FLOW-07 | Pending | Pending |
| 28 | 166:3 | preacherman lab skills页面 开发者模式 | 166:4 | FRAME | SCR-031 | FLOW-07 | Pending | Pending |
| 29 | 166:399 | preacherman lab skills页面 重构1 | 166:400 | FRAME | SCR-032 | FLOW-07 | Pending | Pending |
| 30 | 363:2 | preacherman lab skills页面 重构2 | 363:3 | FRAME | SCR-033 | FLOW-07 | Pending | Pending |
| 31 | 393:2 | preacherman lab skills页面 重构3 | 393:3 | FRAME | SCR-034 | FLOW-07 | Pending | Pending |
| 32 | 436:2 | preacherman lab skills页面 重构5 | 436:3 | FRAME | SCR-035 | FLOW-07 | Pending | Pending |
| 33 | 393:204 | preacherman lab skills页面 重构导出 | 404:2 | FRAME | SCR-036 | FLOW-07 | Pending | Pending |
| 34 | 334:28 | preacherman lab skills页面 导入验证 | 409:379 | SECTION | SCR-037 | FLOW-07 | Pending | Pending |
| 35 | 7:104 | skills test | 22:197 | FRAME | SCR-039 | FLOW-07 | Pending | Pending |
| 36 | 7:105 | state gallery | 53:2 | FRAME | SCR-040 | FLOW-09 | Pending | Pending |
| 37 | 7:107 | state passport | 476:192 | SECTION | SCR-041 | FLOW-09 | Pending | Pending |
| 38 | 7:108 | state ledger | 258:2 | FRAME | SCR-042 | FLOW-10 | Pending | Pending |
| 39 | 514:201 | state status 统一 | 514:202 | SECTION | No direct match* | FLOW-02/10 | Pending | Pending |
| 40 | 514:2 | state status | 514:116 | SECTION | SCR-043 | FLOW-10 | Pending | Pending |
| 41 | 503:1178 | state status 详情 | 514:117 | SECTION | SCR-003 | FLOW-02 | Pending | Pending |
| 42 | 523:2 | state status 详情 2 | 523:3 | SECTION | SCR-044* | FLOW-10 | Pending | Pending |
| 43 | 166:601 | preacherman lab skills页面5 | 166:602 | FRAME | SCR-045 | Archived | Pending | Pending |
| 44 | 166:799 | preacherman lab skills页面6 | 166:800 | FRAME | SCR-046 | Archived | Pending | Pending |
| 45 | 189:1031 | preacherman lab skills页面7 | 189:1032 | FRAME | SCR-047 | Archived | Pending | Pending |
| 46 | 189:1262 | preacherman lab skills页面8 | 189:1263 | FRAME | SCR-048 | Archived | Pending | Pending |
| 47 | 189:1612 | preacherman lab skills页面9 | 189:1613 | FRAME | SCR-049 | Archived | Pending | Pending |
| 48 | 7:2 | Page 1 欢迎页 | 7:11 | FRAME | SCR-050 | FLOW-01 | Pending | Pending |
| 49 | 0:1 | page 2 登录页 | 1:2 | FRAME | SCR-051 | FLOW-01 | Pending | Pending |
| 50 | 1:3 | Page 3 账号创建页 | 7:74 | FRAME | SCR-052 | FLOW-01 | Pending | Pending |
| 51 | 7:98 | Page 4 完善个人信息页 | 7:99 | FRAME | SCR-053 | FLOW-01 | Pending | Pending |
| 52 | 7:101 | Page 5 APP首页 | 8:2 | FRAME | SCR-054 | FLOW-01 | Pending | Pending |
| 53 | 94:2 | 工作区 任务完成后 | 94:3 | FRAME | SCR-055 | Archived | Pending | Pending |

`*` marks a current-Figma/historical-index mismatch that remains visible in the runtime registry.

## First implementation batch

The accepted `281:538` screen is excluded from the six-new-frame limit. The first six new screens are selected strictly by current Figma order and form one continuous Home flow: Status overview, Current State summary/detail, State-figure chat affordance, full conversation, and sent/reply state. The next page (`416:745`) stays Pending and is not partially implemented in this batch.
