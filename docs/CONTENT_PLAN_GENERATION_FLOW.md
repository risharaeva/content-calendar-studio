# Content Plan Generation Flow

Last updated: 2026-05-13

## Goal

Generate a balanced social content plan for the selected planning period from two flows:

1. Inspiration-backed patterns from manually captured competitor, social, Pinterest, TikTok, Instagram, or internal examples.
2. Brand-original strategic gap-fill across content pillars, funnel stages, offers, trust needs, and product priorities.

The target balance is approximately 50/50 or 60/40 when enough inspiration data exists. Inspiration should guide mechanics, not create copied calendars.

## Flow 1: Inspiration Source

Input source: `CompetitorPost` records in the app. The data model keeps its older name for compatibility, but the UI presents it as an Inspiration Inbox.

Each record can capture:

- Source type
- Source name
- Platform
- Post URL
- Published date
- Format
- Theme
- Hook
- Visual pattern
- Offer
- CTA
- Views, likes, comments, shares, saves
- Notes on why it worked
- Active/inactive flag

The planner uses active inspiration records from the recent planning window.

Performance is normalized inside each source account when metrics exist. This avoids treating large-account raw views as automatically better. The current MVP uses a relative engagement score:

```text
engagement = likes + comments*3 + shares*4 + saves*4
if views exist:
  score = engagement/views + log10(views + 10)*0.03
else:
  score = engagement
relative score = post score / source average score
```

## Flow 2: Strategic Gap-Fill

The remaining plan is filled from project-owned strategy:

- Brand profile
- Current priorities
- Content pillars
- Offers
- Tone of voice
- Funnel needs
- Reviewed themes
- Product/image/reference settings

The gap-fill should cover:

- Attraction: fast recognition hooks and relatable situations
- Education: fit, support, use cases, sizing, construction, how to choose
- Trust: reviews, guarantees, returns/exchanges, legitimacy, real-life proof
- Desire: styling, product-on-body, product details, color/texture
- Conversion: offer, bundle, comment-to-shop, next action

## Planner Rule

If enough inspiration data exists:

- Roughly half of the period: adapted inspiration-backed mechanics
- Remaining posts: brand-original strategic gap-fill

If inspiration data is light:

- Use the available inspiration patterns first
- Fill the rest from owned strategy and funnel gaps

If no inspiration data exists:

- Use strategy-only fallback and keep the plan balanced by funnel stage and format

## Adaptation Rule

Do:

- Borrow hook structure
- Borrow offer mechanics
- Borrow CTA mechanics
- Borrow proof logic
- Borrow comment-trigger mechanics
- Borrow visual direction at the level of composition, not exact layout

Do not:

- Copy wording
- Copy product claims
- Copy exact creative layouts
- Copy brand tone
- Copy celebrity/PR-driven mechanics
- Copy body-shaming or oversexualized hooks

## Current MVP Limitation

The app has the source data structure and planner pipeline. It does not yet scrape Instagram, TikTok, or Pinterest automatically. A future parser can write into the same table, so the planner logic will not need to change.
