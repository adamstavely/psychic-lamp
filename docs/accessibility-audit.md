# Accessibility audit: Assist and Build

The target is WCAG 2.2 AA. This audit covers Assist (slice 1: the Daily Brief, Chats with the session panel, Artifacts
and Projects) and Build (slice 2: the catalog, every kind's page, Register, Governance and Insights), in light and dark
themes, at desktop widths and at 200% and 400% zoom.
It records what is checked automatically, what was fixed, what is still open, and what a person still needs to check.

## How it's checked

| Check                                                                                                                                 | Where                                                         | Runs                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| axe-core, WCAG 2.0/2.1/2.2 A and AA rules, light and dark                                                                             | `apps/web/e2e/a11y.ts`, called on every page in the e2e specs | CI, every PR; any violation fails the build |
| Keyboard: each of the first 30 Tab stops on every main page shows a focus indicator and isn't covered by sticky UI (2.4.7, 2.4.11)    | `apps/web/e2e/keyboard.spec.ts`                               | CI                                          |
| Headings: every Build page has one `h1` and never skips a level (1.3.1, 2.4.6)                                                        | `apps/web/e2e/keyboard.spec.ts`                               | CI                                          |
| Reflow at 640px and 320px (200% and 400% zoom on a 1280px screen): nothing on the main pages needs sideways scrolling (1.4.4, 1.4.10) | `apps/web/e2e/reflow.spec.ts`                                 | CI                                          |
| Keyboard flows: skip link, ⌘K, rail, composer (Enter), approvals, verdicts, the checkpoint, new project dialog                        | the feature specs in `apps/web/e2e`                           | CI                                          |
| Template rules (alt text, labels, roles, valid ARIA, interactive elements)                                                            | `angular-eslint` template accessibility rules                 | CI (`npm run lint`)                         |
| Trench Coat usage: unknown properties, attribute vs property, tokens                                                                  | `trenchcoat lint`                                             | CI                                          |
| Contrast of Trench Coat's own tokens, in every look and theme                                                                         | Trench Coat's `check:contrast`                                | Trench Coat CI                              |

The e2e runs use reduced motion, so axe measures colours after entrance fades, not halfway through them.

## Criteria by area

- **Perceivable**
  - Every page has one `h1` and an ordered heading outline. Banner, navigation and main landmarks are present, and every section is a named region.
  - Status is given in words as well as colour: "Before 2:00 PM", "Key meeting", "Waiting for your approval", "Confirmed", "Over the guardrail: p99 latency…", "New in v2".
  - Contrast is Trench Coat's tokens throughout. The only brand colour, the spark in the logo, is decorative.
  - Charts are drawn with `tc-meter-row` (a label and a value in text), and tables are real tables.
- **Operable**
  - Everything works by keyboard, and a skip link leads to `main`.
  - Focus is always visible.
  - Sticky bars (the Brief's ask box, the chat composer) reserve scroll padding, so focus never lands under them.
  - No time limits. Approvals wait for the person, and Trench Coat's countdowns can be stopped.
  - Targets are 24px or more, or spaced to meet 2.5.8.
  - Page titles say where you are ("Q4 fraud model rollout · Donovan").
- **Understandable**
  - Errors say what to do ("That JSON doesn't parse", "Name the project", "Select at least one source to ask about").
  - Saving that fails is undone and announced with a toast.
  - A failed sign-in lands on a page that explains it and offers Try again, instead of looping.
- **Robust**
  - Streaming answers, saves and searches are announced through polite live regions ("Donovan is answering…", "Donovan answered.", "1 artifact matches…", "Saved to notes.").
  - Custom controls are Trench Coat elements, which carry their own roles and states (`aria-pressed`, `aria-expanded`, `aria-current`).

## Fixed while building

| Issue                                                                                                | Criterion     | Fix                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The skip link navigated to `/#main` because of `<base href>`                                         | 2.4.1         | Moves focus to `main` in script                                                                                                                                               |
| A sticky composer and ask bar could cover the focused control                                        | 2.4.11        | `scroll-padding` on the scrolling containers                                                                                                                                  |
| The ⌘K results stayed open over the next focused control                                             | 2.4.11        | Trench Coat fix (below); until then the shell closes them on focus-out                                                                                                        |
| The Brief, artifact viewer, project workspace and chat with its panel scrolled sideways at 200% zoom | 1.4.4, 1.4.10 | Grids reflow, the rail folds below 1024px, and the panel moves under the thread                                                                                               |
| Two "Session intent" regions on the same page                                                        | 1.3.1         | Panel sections are plain groups                                                                                                                                               |
| Prompt starters' `h3` directly under the page's `h1`                                                 | 1.3.1         | A section `h2` above them                                                                                                                                                     |
| The thread scrolled sideways (no `box-sizing: border-box`)                                           | 1.4.10        | Global `border-box`                                                                                                                                                           |
| Read-only tables offered selection checkboxes                                                        | 4.1.2         | `selectable` off                                                                                                                                                              |
| The composer's mic played a sample transcript into real messages                                     | 3.3.x (trust) | Browser speech recognition, which says when none is available                                                                                                                 |
| At 320px (400% zoom) the header needed 620px, and a chat's thread shrank to a strip above its panel  | 1.4.10        | Below 600px the header takes two rows (search below) with New chat as an icon; the thread takes the whole view and its panel follows it; grids, toolbars and ask boxes shrink |

## Build (slice 2)

What Build adds, and how it meets the criteria:

- **Every page is checked the same way.** axe in light and dark, reflow at 640px and 320px, the focus walk, and the
  heading check cover the catalog, all nine kinds' pages, Register, Governance and Insights.
- **Tabs** (a server's Tools, Overview and Install; a model's Card, Use, Files and Evals; a skill's SKILL.md and Tests;
  Governance's Queue, Policies and Tiers) are Trench Coat's segmented control as tabs, each controlling a named tab
  panel. Governance's tab is in the address, so it can be linked to and survives a reload.
- **Dialogs** (Try a tool, Install in a client, Attach to a project, a reviewer's reason) are native `<dialog>`s opened
  modally: focus moves in (to the first field once the form has rendered), Escape closes them, and focus returns to
  the button that opened them.
- **The Register wizard** is a form per step. The step list is a `nav` with `aria-current="step"`; steps already
  reached are buttons. Moving between steps puts focus on the new step's heading, and what's missing is said in words
  ("Name it.") in an alert before the step can be left. Choices are native radio groups and checkboxes in fieldsets
  with legends.
- **Review actions** sit in a group named for the item ("Review Vendor invoice audit"), so their short visible labels
  (Approve, Request changes, Reject) keep their context and still match their accessible names (2.5.3). Requesting
  changes or rejecting asks why, because the submitter needs it.
- **The workflow graph** is a picture (an SVG hidden from assistive technology) in a scrolling box that takes focus,
  so it can be scrolled by keyboard. The same steps, and what follows each, are a list underneath.
- **Insights' bars** are text first: each row has its name, share and count as text, and the bar is decoration. One
  series per list, so colour never carries meaning on its own.
- **Tiers** are always a word ("Confidential"), coloured to match, never colour alone. Risk is a word too.
- **Live regions:** sandbox results, a space's result and review outcomes are announced (status regions and Trench
  Coat's toaster).

### Fixed while building Build

| Issue                                                                                               | Criterion     | Fix                                                                                    |
| --------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| A closed `tc-select` list stayed in the layout and widened pages at 320px                           | 1.4.10        | Fixed in Trench Coat 0.29.1: the closed list isn't laid out                            |
| `tc-select` can't open upward, so the reply box's pickers opened off the bottom of the window       | 1.4.10, 2.1.1 | Fixed in Trench Coat 0.29.1: the list opens upward when there's no room below          |
| The Try dialog opened before its form rendered, so focus landed nowhere                             | 2.4.3         | It opens after the next render and focuses the first field                             |
| The token meter's accessible name didn't contain its visible text                                   | 2.5.3         | The visible "640 / 200k tokens" is the name, with "Context window:" for screen readers |
| The taller reply box covered focused controls at the bottom of a chat                               | 2.4.11        | More bottom scroll padding                                                             |
| `tc-meter-row` (a usage gauge) hid its labels when compact and marked the largest share as "danger" | 1.1.1, 1.4.1  | Insights draws its own labelled bars                                                   |
| A collection's member rows and Insights' panels didn't shrink at 320px                              | 1.4.10        | Rows wrap; panels take the available width                                             |

### Open for Build

- **Bookmarks on the question rail**: bookmarks are Donovan's own toggles; `tc-chat-minimap` has no bookmark of its own.

## Fixed in Trench Coat

0.28.1 ([legendary-chainsaw#139](https://github.com/adamstavely/legendary-chainsaw/pull/139)):

- Stories tiles were named by an `aria-label` that didn't match their visible text (2.5.3).
- The Command Menu's popover stayed open after focus left it (2.4.11).
- The Approval Card's dark-mode shortcut hint was 4.0:1 (1.4.3).

0.28.2 ([legendary-chainsaw#140](https://github.com/adamstavely/legendary-chainsaw/pull/140)):

- The notifications bell was named by an `aria-label` over its visible count (2.5.3).
- The bell's unread badge was below 4.5:1 (1.4.3).
- Angular 22 is in its supported range, so Donovan no longer overrides Trench Coat's Angular peer.

0.29.1 ([legendary-chainsaw#145](https://github.com/adamstavely/legendary-chainsaw/pull/145)):

- A closed Select's list stayed in the layout and widened narrow pages (1.4.10); it couldn't open upward, so a select
  at the bottom of the window opened off-screen.

0.28.3 ([legendary-chainsaw#141](https://github.com/adamstavely/legendary-chainsaw/pull/141)):

- An icon-only button's native button was 0×0 (clicks reached it through the chip), so voice control and screen
  magnifiers might not find a target. It now fills the chip.

Donovan vendors 0.29.1, so the workarounds are gone. `apps/web/e2e/trenchcoat-known.ts` lists any Trench Coat issue
still worked around, with the release that fixes it, and a test fails once that release is installed.

## Open

- **Keycloak's sign-in page** belongs to the identity provider, not this app. Production sign-in should be checked against the provider actually used.

## Still to do by a person

Automated checks find about a third to a half of accessibility problems. Before calling Assist and Build AA, someone
should:

1. Use every page with **VoiceOver** (Safari, macOS) and **NVDA** (Firefox, Windows). Check that headings, landmarks and live announcements are read, especially a streaming answer, an approval, and a claim verdict.
2. Use the whole app **keyboard-only**, including the ⌘K menu, the chat list's rename/pin/delete, `tc-cited-answer`'s citations and `tc-claim-answer`'s claim navigation.
3. Check **200% text-only zoom** (not page zoom), and Windows **High Contrast / forced colours**.
4. Check **voice control** (Voice Control on macOS) on the icon-only buttons in the header and composer.
5. In Build, with a screen reader: register something through all five steps, review it from a second account, try a
   tool and run a space (the results should be announced), and read a workflow through its list of steps.
