# Executive summary

This database supports male-specific application decisions while refusing precision that the literature cannot justify. Its strongest conclusions are broad: many loading zones can grow muscle, volume has a diminishing-return dose response, frequency mainly distributes volume, failure is not required, longer rests often preserve productive work, and total daily protein matters more than perfect timing.

## Training

Healthy adult males can produce hypertrophy across roughly 5-30 repetitions when sets are sufficiently effortful. Moderate ranges are usually more practical; very high repetitions are more vulnerable to cardio, discomfort, grip, stability, or pain becoming limiting. Lighter loads generally need to finish closer to failure. Most work can stay around 0-4 RIR, with 1-4 RIR a conservative default for high-skill compounds and 0-3 RIR for stable isolation work. Momentary failure is optional, not required. (`con_0001`-`con_0003`; `stu_0004`, `stu_0005`, `stu_0006`, `stu_0039`)

Weekly set volume shows a positive but diminishing-return association with hypertrophy. For an application, approximately 6-10 weighted hard sets per muscle per week is a conservative starting band, and approximately 10-20 is a common trained-male productive band. These are not proven muscle-specific thresholds. Taxonomy 2.0 counts direct dynamic work as 1.0, meaningful fractional work as 0.5 or 0.25, and incidental/unknown/isometric work as zero hypertrophy credit while tracking fatigue separately. (`con_0004`, `con_0005`; `stu_0001`, `stu_0002`, `stu_0025`)

Frequency is primarily a scheduling variable. One to three weekly exposures can work when volume is equated; twice weekly is often convenient for quality and distribution, not biologically mandatory. Split large volumes when later sets lose repetitions, load, ROM, technique, or target-muscle limitation. (`con_0006`, `con_0007`; `stu_0001`, `stu_0003`)

Rest long enough to preserve the intended performance—often 2-5 minutes for demanding compounds and 1-3 minutes for stable isolation exercises. Controlled repetitions lasting roughly 0.5-8 seconds can support hypertrophy; intentionally very slow repetitions have no established advantage. (`con_0008`, `con_0009`; `stu_0007`, `stu_0008`, `stu_0026`, `stu_0038`)

Use the largest pain-free, controlled range of motion that preserves the intended joint path. Including exercises that load a muscle at relatively long lengths is reasonable, but the average advantage appears small, heterogeneous, and muscle-specific. Machines and free weights produce similar hypertrophy on average; strength transfer is specific to the trained/tested task. (`con_0010`-`con_0013`; `stu_0009`-`stu_0013`)

## Progression and fatigue

Progress is not only load: more repetitions, the same work at lower RPE/higher RIR, better ROM, cleaner technique, or faster velocity under comparable conditions can all matter. Higher-skill exercises use longer confirmation windows than stable isolation exercises. A single decline is usually insufficient to diagnose regression. (`con_0015`, `con_0016`; `rule_0001`-`rule_0009`)

The database deliberately labels plateau, noise, regression, set-addition, and deload thresholds as operational inferences. No scientific literature validates a universal four-session plateau or a universal 7% regression cutoff. The rules fail conservatively when technique, ROM, pain status, or comparable-session data are missing. (`gap_0004`, `gap_0005`)

Previously developed muscle can often be maintained with much less work than was needed to build it if meaningful load/effort exposure remains. The 25-50% recent-volume estimate is a low-confidence starting point, not a proven minimum for trained young males or for dieting. (`con_0017`; `stu_0027`, `stu_0028`; `gap_0006`)

## Nutrition and body composition

Approximately 1.6 g/kg/day protein covers the average response plateau, with approximately 2.2 g/kg/day a conservative upper target for healthy males. Lean trained males in a deficit may use roughly 1.8-2.4 g/kg body weight/day or the review-derived 2.3-3.1 g/kg fat-free mass/day. Total protein is primary; three to five meaningful feedings are a secondary practical option. (`con_0018`-`con_0020`; `stu_0016`-`stu_0018`, `stu_0033`, `stu_0034`)

Energy deficit impairs lean-mass gain more reliably than strength. The meta-regression estimate near 500 kcal/day is an average inflection, not a universal harm threshold. Use slower loss when leaner or more advanced, preserve load exposure, and reduce low-value sets only after repeated recovery or performance problems. Stable performance during a cut can be success. (`con_0021`, `con_0022`, `con_0026`; `stu_0019`-`stu_0021`)

Recomposition is most plausible for untrained, novice, detrained, higher-body-fat, or previously under-proteined males. It remains possible but generally smaller and less predictable in trained males; a precise probability would be invented. (`con_0023`; `stu_0021`, `stu_0023`; `gap_0008`)

No controlled evidence establishes a universally optimal surplus. Use the smallest surplus that produces a credible weight trend and productive training. Practical gain-rate defaults decline with experience: about 0.25-0.5% body weight/week for novices, 0.15-0.3% for intermediates, and 0.1-0.25% for advanced males. These are low-confidence control bands; a larger surplus does not guarantee faster muscle gain and often increases fat. (`con_0024`, `con_0025`; `stu_0022`, `stu_0036`; `gap_0007`)

Enhanced males remain a separate population. This release does not prescribe drug use, combine enhanced and natural outcomes, or extrapolate enhanced recovery/gain expectations into natural-male rules.

## Highest-priority uncertainties

The most consequential unresolved questions are true per-muscle volume thresholds, fractional indirect-set credit, exact exercise/load-specific RIR, deterministic progression noise bands, deload efficacy, maintenance volume in trained dieting males, optimal surplus size, and validated recomposition prediction. Applications should expose confidence and return `insufficient_data` or a conservative default rather than hide these gaps.
