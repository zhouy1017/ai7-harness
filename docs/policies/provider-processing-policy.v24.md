# Provider Processing Policy v24

This is the human projection of [the immutable v24 JSON](provider-processing-policy.v24.json), validated by [its schema](provider-processing-policy.v24.schema.json). It directly succeeds selected developer-live [v22](provider-processing-policy.v22.md) under [ADR 0091](../adr/0091-admit-four-public-domain-works-as-public-samplebooks.md), decided by the Owner on 2026-10-19. Activation requires the exact [active-set v16](active-policy-set.v16.json) pin and the trusted launch carrier; an internal active label grants no dispatch authority. Local production for the editor's own manuscripts is a different scope with its own document, [v23](provider-processing-policy.v23.md), which this revision does not touch.

## In plain words

Everything v22 allowed under `developer-live` it still allows, and nothing more: the same ten rules, the same Go route (`opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`), the same web and local tools, the same bounds, the same refusals. What changes is which Books count as the admitted development samples. Until now that was exact `sample1` alone, under [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md). From v24 it is the five Public SampleBooks: exact `sample1` and the four public-domain works ADR 0091 admits — 《朝花夕拾》, 《呐喊》, 《老残游记》 and 《儒林外史》 — each only by its exact bytes and SHA-256 in [SampleBooks/README.md](../../SampleBooks/README.md).

## What changed from v22

| Term | v22 | v24 |
| --- | --- | --- |
| `authorityBasis` | 25 entries | the same 25, then `docs/adr/0091-admit-four-public-domain-works-as-public-samplebooks.md` |
| `source.admittedInputs`, every rule | `owner-designated-public-samplebooks-under-adr-0043` | `owner-designated-public-samplebooks-under-adr-0043-and-adr-0091` |

The document identity moves with it (`version`, `predecessorVersion` v22, the canonical, schema and projection paths). No other byte differs from v22.

## What it means in the product

Under `developer-live` a Book whose source is one of the five exact files may be planned and sent under any of the ten rules — baseline analysis, enrolled background analysis, editorial dialogue, review, writing, evaluation, 润色这段, conflict regeneration, 来源译文 and custom analysis — exactly as `sample1` could under v22. Any other Book, including a Book composed from one of the five, a renamed or edited copy, and every local-only manuscript `SampleBooks/README.md` lists, is still refused before dispatch with nothing sent. The five files stay out of every application package, installer and release asset, and development onboarding still imports exact `sample1`.

## What stays refused

The default is deny. Everything v22 refused stays refused: any manuscript outside the five admitted files, 出版政策与风险, Series Knowledge outside the review rule, web tools outside the three research rules, retrieval outside the Run's pinned sources, background origins other than an enrolled baseline analysis, hosted and CI execution, and every other task kind.

## How a launch uses it

The launch resolver verifies this document byte for byte against the active-set v16 pin and reads every rule whole, as it read v22. The set of admitted source digests is the service's own shared list of the five Public SampleBooks; a launch that cannot verify these bytes denies processing. Provider eligibility is not Run Authorization, Apply, export, learning, publication or credential configuration.
