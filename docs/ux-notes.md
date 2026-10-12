# UX simplification — September 2026

The interface uses a document-like layout: a single header, visible navigation, underlined actions, thin rules, system fonts, and compact tables. Serif page titles and monospace amounts provide the early-web character without tiny text, decorative badges, or a hidden mobile menu.

## Fewer steps and less copy

- Navigation takes one click on desktop and mobile; mobile previously required opening the menu first.
- System, Light, and Dark are directly selectable in the header. Previously the theme required a dropdown, inside the mobile navigation on small screens.
- One search field opens and filters Transactions as you type. Clear search is one click. Command/Ctrl+K focuses it, including from Integrations.
- Live/sample data can be switched on any page; previously that control was only on Integrations. Sample data remains explicitly labeled.
- The fake workspace-settings shortcut, static user profile, duplicate transaction search, and repeated payment descriptions are removed.
- Date/source/currency filters appear only on pages where they affect the displayed data. Detailed accounting explanations remain in Help; setup instructions remain alongside connection/import actions.
- Money flow stays collapsed by default. Common tasks remain visible; optional analysis is disclosed on demand.

## Research used

These are established findings available as of September 2026, not a claim that a new 2026 study has validated this particular dashboard.

- [NN/g: The Negative Impact of Mobile-First Web Design on Desktop](https://www.nngroup.com/articles/content-dispersion/) — dispersed content increases interaction costs. The dashboard keeps related information together rather than spreading it over large cards or extra screens.
- [NN/g: Dark Mode — How Users Think About It and Issues to Avoid](https://www.nngroup.com/articles/dark-mode-users-issues/) — users expect their operating-system preference to apply. System is the default; explicit choices persist, and users can return to System. Shared color tokens cover forms, charts, tables, menus, and dialogs.
- [NN/g: Four Principles to Reduce Cognitive Load in Forms](https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/) — use clear structure, visible context, and concise instructions. Controls use explicit labels; import requirements remain close to the upload field.
- [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — reserve disclosure for secondary features rather than adding steps to frequent actions.

## Verification

Production build, finance/API tests, and browser checks cover navigation, search, date filtering, CSV preview/download, flow inspection, dialog focus, live/sample switching, and system/explicit theme behavior. Desktop and mobile layouts are visually reviewed in both themes. Financial calculation rules are unchanged. Task success and perceived simplicity still require testing with actual users; automated checks do not establish those outcomes.
