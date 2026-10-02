# Analytics UX refinement

The owner needs to understand reach, scan intent, and behavior within a selected period, then investigate a specific audience. The dashboard's header constrained its filters, supporting text was small, mobile device/browser panels required an undisclosed sideways scroll, and an empty trend removed the metric controls entirely.

The refinement preserves the existing analytics definitions, routes, authorization, teal/gold design system, and ARC components. It separates report scope from the title, shows the current period/audience/timezone beside the controls, adds ordinary section links, increases supporting text and spacing, and stacks device/browser panels on narrow screens. Metric controls remain available when the trend is empty, with recovery guidance. Disabled comparison has a visible explanation linked with aria-describedby. The mobile filter label remains visible.

Component review found suitable existing date-range picker, filter toolbar, bottom sheet, line chart, sparkline, donut chart, heatmap, and sortable table components. Reusing these retains established keyboard behavior and avoids a second component system. A visually hidden wrapper now contains the donut's semantic data table so intrinsic table width cannot widen a 320px page.

## Validation

- TypeScript, ESLint, existing analytics tests, and production build.
- Local authenticated empty dashboard and a temporary populated fixture at 1440, 768, 390, and 320 CSS pixels.
- Metric switching, section links, mobile filter opening and Escape dismissal.
- Populated charts with reduced motion, plus ordinary-motion empty and populated interaction checks.
- No document-level horizontal overflow or browser runtime errors in final checks.

The sample fixture is removed before commit. Production analytics were not accessed; screen-reader usability and changes in real task completion still need user validation. Suggested usability task: select a date range, filter an audience, explain scan usage, and locate behavior and exact data. Compare task completion and mistakes against the previous dashboard before making broader changes.

## Follow-up refinement

Adapt the useLayouts Filter Interaction (https://uselayouts.com/docs/components/filter-interaction) for real country, device, browser, and traffic-source options. Preserve its shared-surface expansion, overlapping icons, animated option rows, and checkmarks while adding native buttons, Escape/outside dismissal, focus restoration, reduced motion, and single-dimension query navigation. Keep the existing date controls, removable audience chip, and mobile bottom sheet.

Exact trend data is closed by default in a native details disclosure. Activity history defaults to the last 90 recorded days, with 30-day and all-history options, correctly sized day cells, active-day and busiest-day summaries, and a persistent selected-day readout. Clarify that the heatmap sums daily unique counts, which can include the same visitor on different days.

The global button hover selector used to beat a component's default background without updating its text. Lower its specificity so explicit component surfaces win. Keep selected range/date-preset text light on hover and press, and explicitly preserve light text on the selected Compare button. Browser verification covers hover styles, history-range selection, day selection and clearing, disclosure expansion, filter back/Escape behavior, mobile options, and the raw GH country query. Populated views fit at 320, 390, 768, and 1440px with no runtime errors.

Final repository checks: all 143 tests, TypeScript, ESLint, and the production build pass. Browser-measured hover text contrast for standard RGB control surfaces ranges from 5.74:1 to 13.74:1; selected 7D and Compare labels both measure 6.17:1. The generic button's base background also uses low specificity, preserving its ordinary hover behavior while allowing component-specific surfaces to win.

## Compact toolbar and UIArc sheet

The owner needs to change report scope without a large, right-heavy panel competing with the metrics. Replace the boxed scope summary and duplicate audience chips with one full-width toolbar: time controls on the left, one labeled audience control and a clear action on the right. Keep a quiet period/audience/UTC caption below. Align refresh and live status horizontally, remove the decorative KPI hover shadow, and consolidate the comparison baseline explanation beneath the chart context.

Use the actual UIArc bottom sheet registry source (https://uiarc.dev/components/bottom-sheet), adapted to the existing icons, motion tokens, and analytics theme. Mobile filters open at 65% viewport height and can expand to 94% through dragging, the grabber, or keyboard commands. Radix manages modal focus and returns focus to Filters; Done and Close provide explicit exits. An open audience menu consumes the first Escape, while a subsequent Escape dismisses the sheet. Preserve the useLayouts filter interaction, selected-option marks, hover contrast fixes, activity history controls, and closed exact-data disclosure.

Browser validation uses a temporary populated fixture and confirms no horizontal overflow at 320, 390, 768, 980, 1273, and 1440px; selected Chrome marks, mobile country options, nested Escape handling, focus restoration, Done, Close, keyboard expansion, and drag expansion. Check both reduced motion and ordinary motion, including a 320×568 viewport. No browser runtime errors were observed. Remove the fixture before publishing. Production data and screen-reader task completion remain outside these checks.

Final checks for this refinement: ESLint, TypeScript, all 143 tests across 37 files, and the production build pass.
