# 2026-07-24 Public Beta Archive

This repository snapshot records the production source for:

- Chinese / English UI switching;
- persisted player feedback with optional screenshots and lineup codes;
- Cloudflare D1 storage, email notification, and an authenticated admin viewer;
- the `pack-odds-85-v1.0.0` high-rated-card distribution.
- complete English localization for dynamic season results, playoff stories, player
  tags, reasons, and share images;
- result-card position badges moved below the card artwork so they never cover the
  player image.

## Verification

- Production URL: <https://nba-legend-season-simulator.pages.dev>
- GitHub candidate `index.html` SHA-256:
  `44421c36f0ff41bd2d64b5e30a3e28f2400e3eb92edbc61a98b775423ea4e352`
- The production URL remains on the previously deployed build. This GitHub
  candidate has not been redeployed to Cloudflare Pages.
- Feedback backend tests: 19 / 19 passed.
- Pack Monte Carlo: 100,000 packs passed.
- Exactly two `90+` cards: 85.162%.
- Three `90+` cards: 13.744%.
- Four `90+` cards: 1.043%.
- Five or more `90+` cards: 0.051%.
- Guarantee, duplicate-name, and position-coverage failures: 0.
- A real feedback submission was received by the project owner.
- At a 390 x 844 mobile viewport, the English result modal contains no Chinese
  text except the intentional `中文` language-switch label.
- Chinese / English round-trip switching, English share-image generation, and
  all five result-card position badges were visually verified.
- Card artwork and position-badge overlap count: 0 / 5.

## Scope

This archive covers the public-beta infrastructure, pack-odds hotfix, English
result localization, and result-card layout fix. It does not mark the broader
model-integrity audit or dynasty-mode roadmap as complete.
