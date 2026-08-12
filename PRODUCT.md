# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Preacherman is for a user who wants to describe a goal in natural language, review the proposed work, approve risky actions, and receive usable results without operating the underlying agent infrastructure directly.

## Product Purpose

Preacherman is the primary desktop experience for conversation, task control, execution status, reusable AI content, audit history, companion interaction, voice, avatar, plugins, tools, memory, extensions, and complex multi-agent execution.

Success means a user can move through one understandable flow: state a goal, review it, start it, respond when needed, approve risk, and find the result.

## Positioning

Preacherman keeps one user-facing TaskRun and one approval surface while routing execution across local tools, MCP, plugins, and its private execution service. Technical runtimes remain replaceable and observable without becoming separate products the user must learn.

## Operating Context

- The product runs as a React/Vite interface in a Tauri desktop shell.
- The stable primary navigation is Home, Work, Gallery, Lab, Ledger, Settings, and Test.
- Home starts conversation and shows the current task at a glance.
- Work owns planning, confirmation, execution controls, approvals, recovery, and task results.
- Gallery owns reusable characters, widgets, and gamelets.
- Lab owns voice, avatar, and experimental interaction.
- Ledger owns conversations, task history, artifacts, capability evidence, and memory.
- Settings owns providers, connections, MCP, plugins, widgets, and preferences.
- Test owns acceptance checks, diagnostics, and runtime traces.

## Capabilities and Constraints

- Preserve existing routes, primary navigation labels, functional controls, and API behavior during the frontend redesign.
- Every executable action has one owner page. Other pages may show status or navigate to the owner, but must not duplicate the action.
- Use progressive disclosure for technical capabilities and diagnostics.
- The browser talks only to the local Preacherman service. It must not hold private execution credentials or call the underlying execution service directly.
- Agent execution and voice are separate provider concerns. Voice quality must not determine the model used for complex execution.
- Provider keys are intentionally undecided until credentials are supplied. Unconfigured states must remain honest and usable.
- Light and dark appearance are mandatory. `preacherman.preferences` and the semantic `--demo-theme-*` variables are authoritative.

## Brand Commitments

- Keep the Preacherman name, existing brand mark, quiet neutral palette, restrained motion, and desktop-first interaction language.
- Companion and execution capabilities must read as native Preacherman features, not visibly separate products.
- The original Figma-derived application remains a reference and must not be overwritten by this redesign branch.

## Evidence on Hand

- Product and integration requirements: `docs/preacherman-execution-fusion.md`, `docs/preacherman-execution-fusion-baseline.md`, and the supplied Preacherman fusion taskbook.
- Working Preacherman task, tool, MCP, plugin, voice, ledger, execution, and diagnostic implementations under `apps/preacherman-demo-host`.
- A live local preview at `http://127.0.0.1:1421` and a local service at `http://127.0.0.1:8788`.
- No production testimonials, customer claims, pricing, or performance claims are available and none should be fabricated.

## Product Principles

1. One user goal, one TaskRun, one visible next action.
2. Results and understandable status come before technical machinery.
3. Every action lives in one predictable place.
4. Configuration and diagnostics stay available without crowding daily work.
5. Unavailable capabilities explain what is missing and never pretend to succeed.

## Accessibility & Inclusion

Preserve keyboard access, visible focus, semantic labels, reduced-motion behavior, responsive scaling, and readable contrast in both light and dark appearance modes.
