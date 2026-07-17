# Unify Empty Surface Background Design

## Goal

Make every light-mode empty navigation surface use the Home surface background color `#F7F5F1` without changing any content, layout, navigation, or populated page.

## Root Cause

The Home surface uses `.demo-host { background: #f7f5f1; }`. Empty Work/Lab/Gallery/Test/Ledger surfaces also use `demo-host`, but `.demo-host--empty { background: #ffffff; }` overrides the shared background and creates the visible color difference.

## Change

Remove only the light-mode `.demo-host--empty` white-background override from `apps/preacherman-demo-host/src/styles.css`. Empty surfaces will inherit the existing `.demo-host` background `#f7f5f1`.

Preserve the existing dark-mode rule that gives `.demo-host--empty` the shared `#161615` background. Preserve Settings and every populated page, all navigation behavior, spacing, typography, animation, and window chrome.

## Test Strategy

Add a regression assertion proving:

- `.demo-host` defines `background: #f7f5f1`.
- No standalone light-mode `.demo-host--empty` rule overrides that background.
- The dark appearance selector still includes `.demo-host--empty` and uses `background: #161615`.

The assertion must fail before the CSS override is removed and pass after the one-rule deletion. Then run Demo Host checks and rebuild the formal Tauri production executable.

## Preview

Refresh the stable desktop shortcut executable using `tauri build --no-bundle`. Runtime verification must confirm Home and each empty navigation surface resolve to the same computed light-mode background `rgb(247, 245, 241)`, while Settings is not modified. Keep the final normal application window open.

## Git

Do not stage or commit implementation files and do not push. The standalone design document may be committed without including existing working-tree changes.
