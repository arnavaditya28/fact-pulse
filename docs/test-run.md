# Test run: 2026-10-21T19:05:57.605Z

Search: gemini-grounding · 15/15 as expected · median 3763 ms · p90 4422 ms · 15/15 within the 8s voice budget

| # | Claim | Expected | Got | Score | ms | Spoken answer |
|---|---|---|---|---|---|---|
| 1 | Is it true that the Great Wall of China is visible from space with the naked eye? | low | low | 0 | 4422 | 0 out of 100, very low reliability. One official source and four research documents contradict it. |
| 2 | Humans only use 10 percent of their brains | low | low | 0 | 3803 | 0 out of 100, very low reliability. Two research documents, one news report and one blog or social post contradict it. |
| 3 | India's Chandrayaan-3 landed near the Moon's south pole in August 2023 | high | high | 100 | 3853 | 100 out of 100, very high reliability. Two official sources, one research document, one news report and one blog or social post support it. |
| 4 | Water boils at 100 degrees Celsius at sea level | high | high | 100 | 3417 | 100 out of 100, very high reliability. Three news reports and one blog or social post support it. |
| 5 | The Eiffel Tower is in Berlin | low | low | 0 | 3763 | 0 out of 100, very low reliability. One news report and one blog or social post contradict it. |
| 6 | Mount Everest is the tallest mountain above sea level | high | high | 100 | 3302 | 100 out of 100, very high reliability. One official source, one research document, two news reports and one blog or social post support it. |
| 7 | India won the 2024 T20 cricket World Cup | high | high | 100 | 4021 | 100 out of 100, very high reliability. One official source, one news report and one blog or social post support it. |
| 8 | Drinking eight glasses of water a day is medically required for everyone | low_or_mixed | low | 0 | 3471 | 0 out of 100, very low reliability. Three research documents and two news reports contradict it. |
| 9 | The Reserve Bank of India sets the repo rate | high | high | 100 | 5126 | 100 out of 100, very high reliability. Two official sources and three news reports support it. |
| 10 | Bananas are slightly radioactive | moderate_or_high | high | 100 | 3035 | 100 out of 100, very high reliability. Two official sources, one research document and two news reports support it. |
| 11 | 5G towers spread COVID-19 | low | low | 0 | 4072 | 0 out of 100, very low reliability. Two official sources and three research documents contradict it. |
| 12 | A local bakery in Vellore gave away free cakes to everyone last Tuesday | no_sources | no_sources | 0 | 3768 | 0 out of 100, very low reliability. I couldn't find any source that addresses it, so it can't be rated higher. |
| 13 | Pineapple is the best pizza topping | opinion | opinion | - | 3428 | That sounds like an opinion, so there's nothing to fact-check. Try a claim about a fact, like a number, a date or an event. |
| 14 | India will win the next football World Cup | prediction | prediction | - | 3236 | That's about the future, so no source can confirm it yet. Ask me again once it has happened. |
| 15 | They are hiding the truth about it | vague | vague | - | 2791 | That's too vague for me to check. Who or what exactly, and when? |

## Details

**#1** Is it true that the Great Wall of China is visible from space with the naked eye?
- sources: nasa.gov (official, contradicts); pmc.ncbi.nlm.nih.gov (document, contradicts); wtamu.edu (document, contradicts); britannica.com (document, contradicts); researchgate.net (document, contradicts)
- why: None of the five sources I found back the claim, and only supporting sources earn points, so it stays at 0. One official source and four research documents contradict it.

**#2** Humans only use 10 percent of their brains
- sources: nature.com (document, contradicts); britannica.com (document, contradicts); psychologicalscience.org (media, contradicts); en.wikipedia.org (user, contradicts)
- why: None of the four sources I found back the claim, and only supporting sources earn points, so it stays at 0. Two research documents, one news report and one blog or social post contradict it.

**#3** India's Chandrayaan-3 landed near the Moon's south pole in August 2023
- sources: isro.gov.in (official, supports); science.nasa.gov (official, supports); nature.com (document, supports); theconversation.com (media, supports); en.wikipedia.org (user, supports)
- why: Two official sources added 80, one research document added 30, one news report added 25, one blog or social post added 10. Having different kinds of sources added 20. The evidence check added 20 because the sources back the claim. That's 185, and the scale stops at 100.

**#4** Water boils at 100 degrees Celsius at sea level
- sources: compoundchem.com (media, supports); homework.study.com (media, supports); testbook.com (media, supports); reddit.com (user, supports)
- why: Three news reports added 75, one blog or social post added 10. Having different kinds of sources added 10. The evidence check added 20 because the sources back the claim. That's 115, and the scale stops at 100.

**#5** The Eiffel Tower is in Berlin
- sources: rome2rio.com (media, contradicts); en.wikipedia.org (user, contradicts)
- why: None of the two sources I found back the claim, and only supporting sources earn points, so it stays at 0. One news report and one blog or social post contradict it.

**#6** Mount Everest is the tallest mountain above sea level
- sources: oceanservice.noaa.gov (official, supports); britannica.com (document, supports); education.nationalgeographic.org (media, supports); sciencefocus.com (media, supports); facebook.com (user, supports)
- why: One official source added 40, one research document added 30, two news reports added 50, one blog or social post added 10. Having different kinds of sources added 20. Recent coverage added 5. The evidence check added 20 because the sources back the claim. That's 175, and the scale stops at 100.

**#7** India won the 2024 T20 cricket World Cup
- sources: icc-cricket.com (official, supports); cricbuzz.com (media, supports); en.wikipedia.org (user, supports)
- why: One official source added 40, one news report added 25, one blog or social post added 10. Having different kinds of sources added 20. The evidence check added 20 because the sources back the claim. That's 115, and the scale stops at 100.

**#8** Drinking eight glasses of water a day is medically required for everyone
- sources: urmc.rochester.edu (document, contradicts); mayoclinic.org (document, contradicts); pubmed.ncbi.nlm.nih.gov (document, contradicts); michiganmedicine.org (media, contradicts); atlantichealth.org (media, contradicts)
- why: None of the five sources I found back the claim, and only supporting sources earn points, so it stays at 0. Three research documents and two news reports contradict it.

**#9** The Reserve Bank of India sets the repo rate
- sources: m.rbi.org.in (official, supports); ies.gov.in (official, supports); reuters.com (media, supports); tradingeconomics.com (media, supports); ddindia.co.in (media, supports)
- why: Two official sources added 80, three news reports added 75. Having different kinds of sources added 10. Recent coverage added 5. The evidence check added 20 because the sources back the claim. That's 190, and the scale stops at 100.

**#10** Bananas are slightly radioactive
- sources: epa.gov (official, supports); energy.gov (official, supports); britannica.com (document, supports); mcgill.ca (media, supports); mirion.com (media, supports)
- why: Two official sources added 80, one research document added 30, two news reports added 50. Having different kinds of sources added 20. The evidence check added 20 because the sources back the claim. That's 200, and the scale stops at 100.

**#11** 5G towers spread COVID-19
- sources: congress.gov (official, contradicts); unicef.org (official, contradicts); latrobe.edu.au (document, contradicts); sciencedirect.com (document, contradicts); bu.edu (document, contradicts)
- why: None of the five sources I found back the claim, and only supporting sources earn points, so it stays at 0. Two official sources and three research documents contradict it.

**#12** A local bakery in Vellore gave away free cakes to everyone last Tuesday
- sources: none
- why: With no sources, the Veridex rules start and end at zero. A claim needs at least one official, research or news source to score well.

**#13** Pineapple is the best pizza topping
- sources: none
- why: -

**#14** India will win the next football World Cup
- sources: none
- why: -

**#15** They are hiding the truth about it
- sources: none
- why: -
