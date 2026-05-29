# Content Topic System — ILARIA Intimates

A proposal for how themes are **collected smartly** and turned into **generation-ready content packets**, replacing the current hardcoded topic/hook defaults.

> **Status:** strategy direction current. The seed idea pool (§5) is grounded in the 2025–2026 competitor/market research (styling/feature lens). Brand-level signals are **framing patterns, not measured per-post engagement** — treat as hypotheses and revalidate quarterly. Full evidence + sources: `docs/COMPETITOR_TEXT_ANALYSIS.md`.

---

## 0. Strategy inputs (current direction)

**What ILARIA is about.** A "beauty-portal" brand for comfortable shaping intimates — bras, gentle shapewear, bodysuits, long-wear support. The brand shows women they look and feel **gorgeous and chic at any weight, any figure, any age**, and teaches them **how to stay chic** — through styling and product, never through slogans.

**Who we talk to.** Women who want to look put-together and feel great. **We do NOT target by age** and we do NOT frame content around being older.

**Tone.** Good vibes, great mood, aspirational, useful, warm. Desire and delight — not problems or anxiety.

**What we emphasize:**
- **Styling & beauty-portal content** — how to mix and pair pieces, lookbooks, capsule wardrobes, travel/packing wardrobes, self-care, getting ready.
- **Product features & craft** — wide straps, massage/cushioned inner pads, special bodysuit inserts, a **detachable bottom on bodysuits** (easy to take off / bathroom-friendly), soft premium fabric, invisible seamless construction.
- **Everyday wearability as desire** — wear it all day, easy to put on, **invisible under clothing** (so you can wear any fitted/clingy outfit over it), versatile across outfits, easy care, quality, softness.
- **Beyond garments** — lookbooks, capsules, and our pieces + complementary products, especially as carousels.

### Retired — do NOT use (tested and rejected)
- ❌ Age-targeting / "if you're over 40, this is for you" / midlife / perimenopause framing.
- ❌ "Why your body/size changed" and any explanation that the viewer is no longer young/beautiful.
- ❌ Problem- and purchase-anxiety-led angles ("reduce the fear of buying", "the mistake you're making").
- ❌ Body-shaming, "hide flaws", "transform your body", "flawless", "snatched", before/after slimming.
- ❌ Generic empowerment slogans ("embrace your curves", "feel confident", "designed for every body", "discover comfort", "goddess", "unapologetic"). We **show** beauty through styling and features — we don't preach it.

---

## 1. Two clean axes

Today the planner mixes topical themes and creative motifs in one `theme` field, with hardcoded jokes ("group chat reality", "Nancy Meyers morning", "chair test", "6 PM bra patience") that repeat and have tested as stale. The new system separates two axes.

### Axis A — Content territory (the WHAT)
Four territories replace the old anxiety/fit pillars:

| Territory | What it covers | Default format |
|---|---|---|
| **T1 Styling & looks** | mix & match, lookbooks, capsules, travel wardrobes, "what to wear under what" | Carousel / styling reel |
| **T2 Staying chic & self-care** | feeling and looking fabulous, getting-ready, routines, good-vibes lifestyle | Reel |
| **T3 Product features & craft** | wide straps, massage pads, bodysuit inserts, detachable bottom, soft/quality fabric, invisible construction | Carousel / feature reel |
| **T4 Everyday wearability** | all-day comfort, easy on, invisible under clothes, versatility, easy care | Reel |

Cross-cutting tone: **good vibes, no age, no body-fixing.**

### Axis B — Hook / trigger archetype (the HOW; a rotating layer)
Lead with **desire and delight**, not problems. Useful working trigger shapes:
- **Outcome / showcase** — show the look or feature paying off ("3 ways to wear one piece").
- **Specific & concrete** — one real detail or number, never vague.
- **Styling how-to** — "what goes under…", "pack this for…".
- **Feature aha** — reveal a clever feature (e.g. the unsnap bottom) as a delightful surprise.
- **Contrarian (light & positive)** — gently flip a styling assumption, never a body criticism.

**Retired openers:** delayed/generic intros ("Have you ever wondered…", "Let me tell you about…", "Okay so…"), static smiling/corporate intro, vague curiosity gaps, problem/warning/loss-aversion framing, and the old fixed motifs. (Targets the opening line, not face-to-camera as a format.)

---

## 2. The idea pool (how themes get collected — "smartly")

Every theme is a structured **Idea** record, not a free-text string:

```
Idea {
  territory:     T1 | T2 | T3 | T4
  topic:         specific subject (e.g. "a 3-piece capsule for a weekend away")
  hookArchetype: one of the trigger shapes
  hookLine:      a concrete ILARIA-original opener (draft, to test)
  format:        carousel | reel | banner
  ctaHypothesis: a CTA to A/B test (NOT assumed best practice)
  technique:     tag used to prevent repeating a device 2x/month
  source:        research-seed | competitor | our-idea | our-performance
  testHypothesis:what we are testing with this post
  score:         composite of the 6 success criteria (below)
  validUntil:    freshness horizon (revalidate quarterly)
}
```

**Four feeds populate the pool:**
1. **Research seeds** — the starter set in §5 (bootstraps the pool today).
2. **Competitor signal** — `CompetitorPost` table + competitor audit (existing ingest path).
3. **Our ideas** — the in-app ideas input (existing channel) — satisfies "mentioned in our ideas".
4. **Our performance** — `PublishedPost` likes/comments — **added later** (we start without it); lights up automatically once metrics exist.

---

## 3. Scoring — the 6 success criteria, operationalized

| Criterion (owner's words) | How it is scored |
|---|---|
| Works for competitors / gets reactions | strength of competitor + our-performance signal behind the technique |
| Includes CTA and hook | must have a hookArchetype + ctaHypothesis, or it is incomplete |
| Test potential | does it carry a clear, falsifiable testHypothesis? |
| Mentioned in our ideas | boost if the topic appears in the in-app ideas feed |
| Relevant / current / useful | recency, territory priority this month, penalty for retired/stale archetypes |
| No technique 2x in one month | hard de-dup at selection time by `technique` tag |

---

## 4. Monthly selection + packet prep

**Selection (the planner):**
1. Cover all 4 territories in a target proportion (configurable).
2. Take the highest-scored ideas per territory.
3. Enforce **no `technique` and no `hookArchetype` repeated more than once per month.**
4. Assign format by territory (carousel vs reel) unless the idea overrides.

**Packet prep (generation-ready):** each selected Idea carries hook archetype + concrete hook + format + CTA hypothesis + territory context. These flow into `buildPacket` as **structured constraints**, alongside the existing `buildStyleGuard` (anti-cliché) and `buildCompetitorMechanicsGuide`, so generation is guided rather than generic.

---

## 5. Seed idea pool (grounded in the competitor/market research)

Hook lines are ILARIA-original mechanics — compliant (no competitor wording, no banned phrases, no age framing, no fake urgency). **CTAs are hypotheses to A/B test.** Safest baselines: invite a comment (replying to comments is the one verified engagement lift) and "save this" on carousels (carousels are the verified save/engagement format). Tags: **[r]** = grounded in a verified research finding; **[new]** = ILARIA-signature feature with no competitor benchmark (a net-new bet to test).

### T1 — Styling & looks
- **One piece, 3 ways** [r] · one bodysuit/cami styled into 3 seasonal outfits · reel (discovery) or carousel (saves) · technique: one-piece-many-ways · CTA-hyp: "Save the look you'd wear first."
- **Pack-light capsule** [r] · a small mix-and-match weekend/travel set built on one base piece · carousel, slide-per-piece · technique: travel-capsule · CTA-hyp: "Save this before you pack."
- **The piece that makes the trend work** [r] · what to layer under a sheer skirt / slip dress / tee-on-tee · carousel or short reel · technique: what-to-wear-under · (the strongest age-agnostic styling hook in the research).
- **Desk to dinner, one base** [r] · style one piece work-to-night · reel · technique: work-to-night.

### T2 — Staying chic & self-care
- **Get ready with me, easy version** [r] · good-vibes routine; aspiration tied to style & feel, not fixing the body · reel · technique: grwm.
- **The base that makes the outfit** · quick styling routine · reel · technique: quick-base.

### T3 — Product features & craft
*(Pattern [r]: name the feature + the benefit it unlocks; double-duty/versatile, never slimming.)*
- **The detail you'll love: it unsnaps** [new] · detachable bodysuit bottom → bathroom without the full undress · reel · technique: feature-unsnap.
- **Straps that don't dig** [new] · wide / cushioned straps · carousel · technique: feature-straps.
- **Cushioned inside, smooth outside** [new] · massage pads + soft fabric · carousel · technique: feature-fabric.
- **No separate bra needed** [r] · built-in support, double-duty solo or layered · reel · technique: feature-double-duty.

### T4 — Everyday wearability
- **On at 8am, forgot by noon** [r] · all-day comfort, just the feeling (no age framing) · reel · technique: all-day-comfort.
- **Invisible under everything — even the clingy dress** [r] · no lines / invisible under clothes · reel · technique: invisible-under-clothes.
- **On in 10 seconds** [new] · easy to put on · reel · technique: easy-on.

**Format mapping [r]:** carousels for capsule/lookbook/feature-breakdown (saves); reels for one-piece-many-looks, GRWM, comfort-in-motion, feature aha (discovery). **Hashtags [r]:** accurate styling/staple tags (e.g. #StyleTips, #WardrobeStaples, #EverydayStyle, #BodysuitOutfits, #OOTD) + true feature tags — never a competitor brand name.

---

## 6. The feedback loop (how it gets "smarter")

When `PublishedPost` metrics arrive (the "B" bulk-entry task), the **our-performance** signal re-scores the pool: techniques that earned reactions rise, those that didn't fall. Because each post records its `technique` / `hookArchetype` / `ctaHypothesis`, reactions attribute back to the device — so CTA hypotheses get answered by **our own A/B data** instead of guesswork.

---

## 7. What we are NOT assuming (refuted / unproven in research)

- ❌ Competitors abandoned slimming / body-policing language (refuted ×2) — they run wearability/invisibility AND slimming language in parallel. We choose the styling/wearability frame **deliberately**, not because the category dropped it.
- ❌ "Wearability/invisibility instead of slimming" measurably outperforms (unproven) — A/B test it, don't assume.
- ❌ Comment-keyword→DM CTAs beat "link in bio"; "DM shares are the #1 signal"; negative/loss-aversion hooks win; the 1.5s/3s rule — all refuted. CTAs are test hypotheses only.
- ⚠️ Brand-level findings are **framing patterns from marketing copy**, not measured per-post engagement (only the carousel-vs-reel format split is hard data). Treat competitor ideas as hypotheses.
- ⚠️ ILARIA's signature features (massage pads, bodysuit inserts, detachable bottom) have **no competitor benchmark** — net-new bets to test, not proven winners.

(Verified format signal: carousels win engagement rate → lookbooks/capsules/feature breakdowns; reels win reach → styling transitions, GRWM, comfort-in-motion, feature aha. Revalidate quarterly — trend items are seasonally perishable.)

---

## 8. Implementation phasing

- **Phase 1 (now, no DB change):** replace hardcoded `ilariaOriginalItems` + fixed motifs with this research-seeded idea pool (typed array) + territory-coverage + no-repeat-technique selection in `buildPlanFallback`, and inject territory + trigger-archetype + format guidance into the LLM plan prompt. Retire the old motifs. De-generics both paths immediately.
- **Phase 2 (DB change — owner runs migration):** persist Ideas as data so competitor ingest + the in-app ideas feed grow the pool.
- **Phase 3:** wire `PublishedPost` metrics → re-scoring (depends on the "B" bulk-entry task).
- **Phase 4:** per-post technique/CTA logging → attribution → the loop learns.

---

## 9. Compliance + maintenance

- Mechanics/structure only — never copy competitor wording; never put competitor or other brand names in published copy or hashtags.
- Hard avoids enforced: age-targeting/decline framing, body-shaming, "transform/flawless/snatched", generic empowerment slogans, fake urgency, fabricated proof, unsupported "science-backed" claims.
- Format/hook benchmarks shift fast — **revalidate quarterly**; `validUntil` on each Idea forces a refresh.
