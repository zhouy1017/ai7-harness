---
status: accepted
date: 2026-10-20
deciders: Owner
amends: ADR 0071, ADR 0076, ADR 0077
---

# 0092 · Refine editor-facing aesthetics, motion and Book switching

## Context

On 2026-10-20 the Owner supplied a local UI patch and instructed: “The patch lacks real testing and intergation. Just follow the design and principle of the patch and make the changes to dev. Open an issue and PR as ruleset.” This current instruction accepts its warm-paper/night-ink direction; it does not attest any review, test, PR or integration history in that patch. [Issue #1002](https://github.com/zhouy1017/ai7-harness/issues/1002), brief revision 2, bounds implementation from `dev@30c55f047fba2fcb42a7bfee37a9dc2aa775c65a` through wave 16. No earlier design review is asserted.

## Decision

Use warm paper chrome with a slightly warmer manuscript surface in light mode, and low-glare night-ink chrome with a warm neutral manuscript in dark mode. A restrained clay accent replaces blue application actions; existing editorial mark meanings remain. Semantic token parity, text contrast of at least 4.5:1, identifying boundaries of at least 3:1, visible focus and native forced colors remain mandatory. Theme changes preserve reading position, selection and focus.

Use short spatial transitions for user-driven shell layout changes and subtle control feedback. Motion must visibly interpolate properties that actually change, yield entirely to reduced motion, and never delay persistence/protection or authority state. It must not imitate model streaming or animate background Run activity.

Offer a keyboard- and pointer-accessible searchable Book switcher in the shell, including its icon layout. Read the current catalog on each opening; show loading, empty, filtered-empty and recoverable failure states distinctly. Order current catalog entries in named pinned, recent and remaining groups, using catalog titles and identity to discard stale preferences and duplicate rows. Search full titles and IDs as text. Preserve current Book identity, dismiss with Escape/outside action, restore appropriate focus and use existing Book/library routes. Late requests from earlier openings must not repaint the current list.

Give continuous manuscript reading more vertical room while retaining usable widths with contextual surfaces and zoom. Put the exact journal sequence behind a closed-by-default native `查看技术详情` disclosure. Keep editorial revision, persistence and protection/recovery warnings visible; opening details has no record effect.

### Exact reference clauses amended

- `requirements.md`: V2-UX-VIS-008 only replaces the cool-neutral/neutral palette direction. VIS-004–007/009, VIEW-007 and IA-008–010 retain their obligations.
- `visual-direction.md`: the first “Qualities to retain” bullet, the palette sentences in “Theme and color roles”, and the mode-transition paragraph in “Accepted work-surface rhythm”.
- `editor-surfaces.md`: §0.3 visual-signature bullet and Book-switching addition; §1 final-form central manuscript bullet and technical-disclosure addition; §8.2 shell-switcher addition.
- `README.md`: add D-091 as the index of this refinement.

No other frozen clause changes. ADR 0071 layering/liveness, ADRs 0076/0077 manuscript-first organization, D-084 waiting-only semantics, domain records, schemas, protocol, policies, dependencies and authority remain unchanged.

## Consequences

The warm palette supersedes the cool chrome direction only in the named clauses. The supplied implementation is a reference requiring correction, particularly actual technical disclosure, asynchronous catalog handling and accessible dismissal. Verification belongs to the existing unit seams and supported Journeys; this decision claims no implementation completion or dev integration.
