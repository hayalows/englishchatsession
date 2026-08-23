# Audience card design QA

## Comparison target

- Source visual truth, resting state: `C:\Users\USER\AppData\Local\Temp\codex-clipboard-ee1b4a77-d150-49b8-965b-7470dbf8fa21.png`
- Source visual truth, hover state: `C:\Users\USER\AppData\Local\Temp\codex-clipboard-47b187cd-f3ea-44fc-a295-724ac71e73ca.png`
- Implementation, resting state: `C:\Users\USER\.codex\visualizations\2026\08\13\019ffd35-7f3b-7771-bf4e-5995bf9c9eb7\analytics-audience-desktop-final.jpg`
- Implementation, hover state: `C:\Users\USER\.codex\visualizations\2026\08\13\019ffd35-7f3b-7771-bf4e-5995bf9c9eb7\analytics-audience-desktop-final-hover.jpg`
- Implementation, mobile: `C:\Users\USER\.codex\visualizations\2026\08\13\019ffd35-7f3b-7771-bf4e-5995bf9c9eb7\analytics-audience-mobile.jpg`
- Implementation, mobile detail sheet: `C:\Users\USER\.codex\visualizations\2026\08\13\019ffd35-7f3b-7771-bf4e-5995bf9c9eb7\analytics-audience-mobile-detail.jpg`

## Capture normalization

- Source pixels: 1336 x 232, supplied desktop crop.
- Implementation pixels: 1327 x 222, captured from the same desktop card region.
- CSS viewport: 1327 x 454 at device scale factor 1.
- States compared together: resting cards and first-card hover/action-tray state.
- Mobile verification: 375 x 812. Landscape verification: 844 x 390.

## Fidelity review

- Fonts and typography: the cards retain the product's Inter type system while matching the source's compact label sizing, weight hierarchy, uppercase metric label, and tabular percentages.
- Spacing and layout: three equal-height panels, 220.5px measured card height, 12px grid gap, thin dividers, compact rows, proportional fills, and a centered bottom action handle match the source rhythm.
- Colors and tokens: existing Finder surface, line, ink, and muted tokens preserve product cohesion. Hover elevation is deliberately subtle.
- Image and icon quality: country markers use local 3:2 SVG flags. Card controls use one consistent Phosphor icon family.
- Copy and content: card labels remain Countries, Devices, and Browsers because those are the existing privacy-safe Finder dimensions. The visual treatment matches the reference without inventing operating-system data.
- Interaction: hover reveals the action tray; keyboard focus reveals the same tray and tooltip; touch layouts keep both actions visible at 44px minimum size. View all opens the existing searchable detail sheet, and CSV export remains available.

## Comparison history

1. Initial comparison found a P2 density mismatch: cards measured about 245px high and lacked the source's active-title underline. Row height, spacing, radius, and title treatment were corrected. The revised cards measure 220.5px and visually align with the source crop.
2. Initial comparison found a P2 platform inconsistency: Windows rendered Unicode country flags as letter pairs. They were replaced with local SVG flags and re-captured successfully.
3. Final resting and hover captures were compared with both supplied source states. No actionable P0, P1, or P2 differences remain.

## Responsive and accessibility evidence

- Desktop hover tray and `View all` tooltip were visually verified.
- Keyboard focus visibly reveals the tray and tooltip.
- Mobile page width remained 375px with no document overflow; action buttons measured 44 x 46px.
- Mobile detail sheet opened, locked background scroll, remained within the viewport, and returned to the card on close.
- Landscape layout rendered two columns without horizontal page overflow.
- Reduced-motion CSS disables the card, tray, handle, row-fill, and button transitions.

## Follow-up polish

- The reference has three hover actions; Finder intentionally shows only two meaningful actions, View all and Export CSV, to avoid duplicate or inert controls.
- The source combines Devices and Browsers as tabs and shows Operating Systems. Finder keeps its current three collected dimensions so this visual refinement does not expand analytics collection or the Neon schema.

final result: passed

## Full dashboard cohesion pass

- Extended the audience cards' flat surface, thin divider, compact header, restrained radius, and subtle hover elevation to the trend, scanner, time-spent, and scan-mode panels.
- Removed the nested chart frame so the trend reads as one continuous analytics surface. Exact values remain available through pointer, touch, keyboard, and the existing trend-data table.
- Added clear section hierarchy: Audience, Behavior, and Explore. The always-visible source and scan-mode section removes a disclosure click while metric definitions remain collapsed as secondary help.
- Kept Inter and the existing Finder color tokens, tightened the display scale, enabled tabular numerals, and corrected panel headings to follow the page's H1-H2-H3 structure.
- Kept Today as the default view. Range, Filter, and Refresh remain grouped; Filter keeps its text label on narrow phones; opening one filter closes the other; outside clicks close open panels.
- Replaced remaining handcrafted control SVGs with the project's Phosphor icon family.

### Responsive verification

- Desktop: 1366 x 768, including the chart, all three audience cards, behavior cards, and the always-visible Explore section.
- Mobile portrait: 375 x 812 with no horizontal document overflow. Time range, Filter, Refresh, More, and card actions retain at least 44px touch targets.
- Mobile landscape: 844 x 390 with no horizontal document overflow; controls remain readable and do not overlap the heading or KPI strip.
- The chart height is reduced on mobile to keep the first audience card within a useful initial scroll while preserving exact-value access.

### Scope and data safety

- This pass changes presentation and interaction only. It does not change the Neon analytics schema, event collection, scanner requests, slot scanning, or finder availability behavior.
- No new visitor attributes are collected.

full dashboard result: passed
