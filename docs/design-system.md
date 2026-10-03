# BoostMaster Material Design 3

BoostMaster uses Material 3 roles with its existing green brand. The reusable
`material-design` Codex skill is installed in the user's Codex skills directory.
Use it for UI changes in this project, alongside `boostmaster-development`.

## Source and tokens

`app/material.css` owns the Material tokens and component styles. It is imported
by `app/globals.css`. `material-design` on the root body includes React portals
in the theme scope. The old Tailwind utility names are bridged to Material roles
where they represent shared surfaces, text, borders, selection, or actions.
Prefer semantic component classes for new components instead of expanding that
bridge or adding hardcoded per-screen colors.

The light and dark schemes were generated from seed `#4f936f` using Google's
`@material/material-color-utilities` 0.4.0, `SchemeTonalSpot`, standard contrast
(`0`), and the `2021` specification. These are static generated values; the app
does not need a runtime color generation dependency. `html.dark-mode`,
`body.dark-mode`, and `.app-dark` select dark roles. The login screen retains its
existing always-light behavior with the same light Material scheme.

| Component | Treatment |
| --- | --- |
| Background | Surface, with on-surface text |
| Lists | Outlined cards, 12px corners, restrained hover elevation |
| Main buttons | Primary/on-primary, pill shape |
| Secondary controls | Outlined surface or tonal secondary containers |
| Text fields | 8px outlined corners, outline/primary focus, error for invalid fields |
| Desktop navigation | Tonal container with selected pill and current-page semantics |
| Mobile navigation | 80px bar, 24px icons, tonal selected icon indicator, visible labels |
| Dialogs | Surface-container-high, 28px corners, level 3 elevation, scrollable height |
| Floating actions | Primary-container/on-primary-container, 56px size, 24px icons |
| Destructive actions | Error/on-error |

## Product adaptations

- Preserve the established Geist typeface with Korean system fallbacks and the
  BoostMaster wordmark. Material's title/body/label hierarchy is applied without
  replacing brand artwork.
- The user requested two circular floating controls: AGENT at the lower left,
  Add at the lower right. Preserve the full-round shape instead of Material's
  default medium-FAB shape. Both use `--md-app-fab-bottom` and viewport positioning.
- Add controls use portals because the screen-swipe transform would otherwise
  change their fixed-position containing block. Keep explicit list visibility
  checks on portals, including `RoutineTracker.isActive`.
- Main navigation, mobile toolbars, dialog actions, and login inputs use larger
  touch areas. Dense calendar marks and inline list controls retain their existing
  layout; check for overlapping targets when expanding those separately.
- Existing completion, focus, drag, warning, and celebration indicators retain
  their meaning. Styling changes must preserve CRUD, permissions, and AI flows.

## Verification

Run TypeScript and ESLint for changed components, and a production build when
changing global CSS or its imports. Check light/dark role-pair contrast, desktop
and narrow mobile layouts, empty lists, input focus, navigation selection, and
portal dialogs. Report when an interactive browser/session is unavailable;
static checks do not establish visual correctness.

Official references:
[color](https://github.com/material-components/material-web/blob/main/docs/theming/color.md),
[typography](https://github.com/material-components/material-web/blob/main/docs/theming/typography.md),
[shape](https://github.com/material-components/material-web/blob/main/tokens/_md-sys-shape.scss),
[FAB](https://github.com/material-components/material-web/blob/main/docs/components/fab.md).
