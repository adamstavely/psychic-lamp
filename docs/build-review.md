# Build review (slice 2), against the prototype

What's broken, partly working, inconsistent or missing in Build mode, from a page-by-page comparison with the Donovan
prototype and a trace of every control in the code. Each fix below is one PR; the list is checked off as they merge.

## Fixes, in order

1. **One page frame and header for Build.** _(Done.)_ Every page gets the prototype's frame (32px × 40px padding; the detail
   pages two equal columns, main and aside, up to 1100px), its **back button** (a 30px bordered button with a chevron,
   named for the area, not an underlined link), and its header (24px/700 title, a type tag and a tier badge as bordered
   pills, a 13px meta line, a 15px summary). One tag/badge system, one section-heading style (12px/600 uppercase,
   muted), one stat-tile style, one info-card style in the aside, one table style. Data shown twice goes (a workflow's
   summary repeating its meta line; autonomy, owner, version, score, format, "Verified" shown as a tag and a spec row).
2. **Workflows: the prototype's canvas, with Run and Edit.** _(Done, on Trench Coat's `tc-workflow-canvas`.)_ The toolbar header (back, title, meta, run state, View |
   Edit, Reset and Run now); the dotted canvas with nodes coloured by state and animated edges; a simulated run that
   stops at the approval step and continues on Approve, with a run log; and **Edit**: a palette (Trigger, Tool, Model,
   Skill, Approval, Branch), drag to move, select to inspect (name, binding, on failure, next steps, delete), workflow
   settings, checks (unconnected step, write tool with no approval upstream, no trigger), Discard and Save & publish,
   saved as a new version through review. Plus **New workflow** from the catalog. Two of the three seeded workflows
   have no steps: give them their graphs.
3. **Newly registered items render properly.** _(Done.)_ A model with no metrics, a space with no outputs, a server with no tools,
   a dataset's "updated", a skill keeping the SKILL.md it was registered with (not rebuilt from its headings).
4. **Actions match what's allowed.** _(Done.)_ Pending items don't offer Install, Attach or Use in chat (the API refuses them).
   The wizard's step list can't skip validation, and an agent needs at least one server or skill. Register opens on the
   right kind from Workflows, Prompts, Governance and Insights. Rail counts refresh after registering or a decision.
5. **Links by id, not by name.** _(Done.)_ Agents' servers and skills, datasets' models and collections' members are
   stored by id, so links and tiers can't break or be ambiguous ("Churn Propensity" and "Price Elasticity" are named
   but don't exist: Churn Propensity, which the seeded chats use, is added; Price Elasticity is dropped).
6. **Trench Coat controls instead of raw HTML** where Trench Coat has them: `tc-select`, `tc-radio-group`,
   `tc-checkbox`, `tc-sensitivity-label-picker` (the wizard's tier), `tc-dialog`. _(Done.)_ Still native, as
   Trench Coat has nothing for them yet: text inputs and textareas, and the wizard's kind cards (a radio choice with a
   description per option). Those gaps go to Trench Coat.
7. **Missing states.** _(Done.)_ Errors for Governance's policies, a server's installs and a collection's attachments (they show
   as "loading" or "none" today); the catalog's empty state names the right scope and links to Register.
8. **Smaller gaps from the prototype.** _(This PR.)_ A space's Try it opens it with its sample input filled in and
   focused, ready to run, and Open opens it empty, as in the prototype; a space has Use in chat. The catalog opens on
   Team, as in the prototype, and Team is what teams own plus your own (so a draft or a registration with no team still
   shows); it means your teams once tokens carry groups. Insights' counted figures say how they changed on the 30 days
   before. (Tabs in the address for model and skill pages are no longer needed: the server, model and skill pages have
   no tabs, each is one page.)

## Not in Build's scope here

Prompt Studio and the Skill Builder (slice 3; the prototype has both as full editors). Model Studio training. The Org
page overlay. Real tool calls, space runs and installs (still simulated, as decided).

## Evidence

The full traces (file and line for each control) are in the review PR's description and the session that produced it.
