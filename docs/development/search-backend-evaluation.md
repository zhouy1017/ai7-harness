# Search backend evaluation

<!-- Written by tools/search-backend-evaluation.mjs --report from the recorded runs (Issue #883). Do not edit by hand; the measured numbers are in config/providers/recorded-evidence/search-backend-profiles.json. -->

The development evaluation of the five web search backends the Owner listed (Issue #883; Owner decisions 24″ and 24⁵), measured on 2026-10-15 (UTC; the runs spanned 20:43–20:52 UTC). Each backend is declared by a document under [`config/providers/search-backends/`](../../config/providers/search-backends/) ([provider support](provider-support.md#search-backends)); the sanitized profiles are recorded in [`search-backend-profiles.json`](../../config/providers/recorded-evidence/search-backend-profiles.json), which the registry (`src/service/provider/search-backends.ts`) reads for the default order. Fixture-free numbers from one run per backend on one host on one day: they compare the backends, they do not establish real editorial research quality.

## Outcome (decision 24⁵, applied mechanically)

- **Excluded:** none.
- **Ranking (default order):** 1. `search-tinyfish` (tier 1), 2. `search-deepseek` (tier 1), 3. `search-brave` (tier 1), 4. `search-parallel` (tier 1), 5. `search-bochaai` (tier 2).
- **Default selection:** `search-tinyfish`.

The rule: exclude only the clearly unusable — 尚未支持, unreachable from the mainland host without a proxy, no working authenticated response, or no hit on both the Chinese and the international half. Rank the rest by overall hit rate; every backend within 10 percentage points of the best is the top tier, ordered by price per call (cheapest first; an unknown price last); lower tiers follow in hit-rate order. The first ranked is the default; the Commander confirms it from this report.

## Method

- **Query set:** [`tools/search-backend-evaluation/queries.json`](../../tools/search-backend-evaluation/queries.json) (sha256 `8116d34a2c3b7ef208097e49310a229250dc2c307857656bc9c3943f4cf92676`): 30 queries, 15 Chinese and 15 English, 15 whose best source is an international site. Each is authored from a public fact (constitutional and statistical records, museums and libraries, literary prizes, publishing standards, space missions, international conventions); none quotes or derives from a manuscript.
- **Judgement rubric:** A query is a hit when at least one of the top five results is on a judged-correct domain: one of the query's `primary` domains or one of the reference domains of its language (`referenceDomains`) or the query's own `reference` domains. A URL is on a domain when its host is the domain or ends with `.` followed by it. Source quality: a query with `primary` domains counts a primary hit when one of the top five results is on an official or issuing-body domain it lists; listed results count the top-five results on any judged-correct domain against all results returned (at most five per query). The Chinese half is the queries with `language` zh; the international half is the queries with `international` true (here every English query). Decision 24⁵ excludes a backend that hits on neither half.
- **Network condition:** The Owner's developer host in mainland China, with the proxy off for the measuring process only: the proxy environment variables removed from the process, every request through an explicit direct undici Agent, the host's own proxy settings left as they were. Observed: proxy environment `cleared-in-process`, Node environment proxy `off`, Windows system proxy `enabled-not-used` (read, not changed; Node's fetch does not use it).
- **Procedure:** each backend run once over all 30 queries, sequentially, 2.1 s apart, 30 s per call (120 s for the token-billed DeepSeek call); one retry only when no HTTP response came back, disclosed per backend; nothing retried for a better answer. Latency is the wall time to the full body of every call that got an HTTP response.
- **Review correction after capture:** the original harness allowed an automatic transport retry and claimed a run only after completion. The reviewed harness sends each request once and persists an exclusive run claim before sending, checkpointing after each answer; interrupted or concurrent invocations refuse to repeat it. The historical profiles and probe disclosure below are unchanged; no measurement was repeated for this correction.
- **Credentials:** each slot enrolled by path with `tools/enroll-dev-credential.mjs` under the ADR 0067 amendment clause of Issue #883; the tool asks the Credential Broker for readiness and reads the value through the broker's own read-only store resolver in-process, never from a file, and prints no key and no payload beyond titles and URLs.
- **Price order:** USD as stated; CNY converted at 6.7313 CNY per USD (CFETS central parity of the renminbi against the US dollar as published by Xinhua (news.cn), 2026-10-12, read 2026-10-16) for ordering only; DeepSeek bills tokens, so its price is the measured mean token cost per call at the documented peak price of `deepseek-flash`.

## Measured profiles

| Backend | Verdict | Reached / answered | Hit rate overall | Chinese | International | Primary source | Listed results | p50 | p95 | Price | Key | Transport retries |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 博查 Bocha Web Search (`search-bochaai`) | measured | 30 / 30 of 30 | 53.3% | 60% | 46.7% | 11 of 29 | 17.3% | 100 ms | 328 ms | 0.036 CNY per call (source unverified; re-verify before 设置 display) | required | 0 |
| Brave Search API (`search-brave`) | measured | 30 / 30 of 30 | 100% | 100% | 100% | 24 of 29 | 57.3% | 808 ms | 1283 ms | 5 USD per 1,000 calls | required | 0 |
| DeepSeek 服务端搜索（官方） (`search-deepseek`) | measured | 30 / 30 of 30 | 96.7% | 100% | 93.3% | 28 of 29 | 56.7% | 1741 ms | 2376 ms | tokens, measured 0.001845 USD per call | required | 0 |
| Parallel Search (`search-parallel`) | measured | 30 / 30 of 30 | 100% | 100% | 100% | 27 of 29 | 76% | 3347 ms | 6220 ms | 5 USD per 1,000 calls | required | 0 |
| TinyFish Search (`search-tinyfish`) | measured | 30 / 30 of 30 | 100% | 100% | 100% | 26 of 29 | 59.3% | 1581 ms | 2663 ms | 0 USD per call | required | 0 |

Status classes per backend (2xx / 3xx / 4xx / 5xx / no response):

- `search-bochaai`: 30 / 0 / 0 / 0 / 0; response read at `data.webPages.value`
- `search-brave`: 30 / 0 / 0 / 0 / 0; response read at `web.results`
- `search-deepseek`: 30 / 0 / 0 / 0 / 0; response read at `content[web_search_tool_result]`
- `search-parallel`: 30 / 0 / 0 / 0 / 0; response read at `results`
- `search-tinyfish`: 30 / 0 / 0 / 0 / 0; response read at `results`

## Disclosures

- Before the measurement runs, each backend was probed once with `--probe` (the one fixed public query) to check the tool end to end; the probes are not part of any profile. Four answered; Brave's probe got no HTTP response (`UND_ERR_CONNECT_TIMEOUT`, after its one transport retry), yet Brave's measurement run some minutes later answered all 30 queries. Brave's reachability from this host without a proxy was therefore intermittent on the day, and one run cannot say how often it fails.
- Host routing as observed during the runs: the default route went through the Wi-Fi LAN gateway; no TUN adapter was present and no Tailscale exit node was set; Clash Verge was running and the Windows system proxy was enabled, which Node's fetch does not use and the tool did not change. Whether the LAN gateway itself forwards traffic through a proxy is not observable from the host.
- Each backend was run exactly once; no run was repeated and no query was retried for a better answer. Transport retries (one per call at most, only when no HTTP response came back) are counted per backend in the table above.

## Readings

- **博查 Bocha Web Search price source unverified:** Vendor PDF attachment read by the Worker on 2026-10-16, exact URL not retained; portal pricing page unreachable at review time (redirects to Feishu); re-verify before the price is shown in 设置. The original price input is retained solely to reproduce the recorded ranking; slice 6b must surface the caveat and re-verify the source before presenting the price in 设置.

- **TinyFish Search:** TinyFish is primarily a web-agent platform (Agent API at $0.016 per step), but its documentation (docs.tinyfish.ai/search-api, read 2026-10-16) documents a plain keyed search endpoint, `GET https://api.search.tinyfish.ai?query=…` with the `X-API-Key` header, answering synchronous JSON results with `title` and `url`. Search is billed at $0.00 per request (www.tinyfish.ai/pricing: 30 requests per minute, 500 per hour; the Search API page says free up to 12,000 per day), never drawing on the wallet. The evaluation measured that search endpoint, never the agent.
- **DeepSeek 服务端搜索（官方）:** Does the Anthropic-compatible endpoint run server-side `web_search`? The documentation lists it (api-docs.deepseek.com/guides/anthropic_api, read 2026-10-16: `server_tool_use` and `web_search_tool_result` blocks Supported; the `tools` rows name no tool type) and the Claude Code guide (api-docs.deepseek.com/quick_start/agent_integrations/claude_code) says web search runs through DeepSeek's API at token cost. Measured with Anthropic's `web_search_20250305` server tool on `deepseek-flash`: it searched — 30 of 30 calls returned `web_search_tool_result` content read as results (29 hits).

## Per query

Hit (✓), miss (✗) or no readable answer (—) per backend; the query text is the public query sent.

| Id | Query | `bochaai` | `brave` | `deepseek` | `parallel` | `tinyfish` |
| --- | --- | --- | --- | --- | --- | --- |
| zh-01 | 中华人民共和国宪法 2018年 修正案 通过日期 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-02 | 第七次全国人口普查 全国总人口 公报 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-03 | 鲁迅 狂人日记 首次发表 新青年 1918年 | ✗ | ✓ | ✓ | ✓ | ✓ |
| zh-04 | 故宫博物院 成立时间 1925年 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-05 | 中国国家图书馆 前身 京师图书馆 创建年份 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-06 | 著作权法 第三次修正 施行日期 2021年6月1日 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-07 | 第十一届茅盾文学奖 获奖作品 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-08 | 嫦娥六号 月球背面 采样返回 着陆日期 | ✗ | ✓ | ✓ | ✓ | ✓ |
| zh-09 | 中国人民银行 成立 1948年 石家庄 | ✗ | ✓ | ✓ | ✓ | ✓ |
| zh-10 | 现代汉语词典 第7版 商务印书馆 出版时间 | ✗ | ✓ | ✓ | ✓ | ✓ |
| zh-11 | 图书在版编目数据 国家标准 GB/T 12451 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-12 | 敦煌莫高窟 列入世界遗产名录 年份 | ✗ | ✓ | ✓ | ✓ | ✓ |
| zh-13 | 三峡工程 整体竣工验收 年份 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-14 | 中国作家协会 现任 主席 | ✓ | ✓ | ✓ | ✓ | ✓ |
| zh-15 | 汉语拼音方案 1958年 全国人民代表大会 批准 | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-01 | Universal Declaration of Human Rights adopted General Assembly resolution 217 date | ✓ | ✓ | ✓ | ✓ | ✓ |
| en-02 | Nobel Prize in Literature 2012 laureate | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-03 | Berne Convention for the Protection of Literary and Artistic Works year adopted | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-04 | ISBN 13 digit format introduced 2007 ISO 2108 | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-05 | James Webb Space Telescope launch date | ✓ | ✓ | ✓ | ✓ | ✓ |
| en-06 | Chicago Manual of Style 18th edition publication year | ✓ | ✓ | ✓ | ✓ | ✓ |
| en-07 | Gutenberg Bible printed Mainz year | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-08 | Oxford English Dictionary first edition completed 1928 | ✓ | ✓ | ✓ | ✓ | ✓ |
| en-09 | UNESCO World Book and Copyright Day date origin | ✓ | ✓ | ✓ | ✓ | ✓ |
| en-10 | Library of Congress founded year | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-11 | Frankfurt Book Fair 2024 guest of honour country | ✓ | ✓ | ✓ | ✓ | ✓ |
| en-12 | Booker Prize 2023 winner | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-13 | Pulitzer Prize for Fiction 2024 winner | ✗ | ✓ | ✗ | ✓ | ✓ |
| en-14 | Unicode 15.1 release date CJK Unified Ideographs Extension I | ✗ | ✓ | ✓ | ✓ | ✓ |
| en-15 | World Health Organization constitution entered into force 7 April 1948 | ✓ | ✓ | ✓ | ✓ | ✓ |

## Judged sources

The first judged-correct result in the top five, per backend and query (titles and URLs only; a miss names its first result).

### `search-bochaai`

- zh-01: ✓ 首页 — <https://www.93.gov.cn/html/93gov/zt/lh2018/xwjj/180316165228475474.html>
- zh-02: ✓ 【转】第七次全国人口普查主要数据-普查动态 — <http://www.jieyang.gov.cn/tjj/pczl/pcdt/content/post_609641.html>
- zh-03: ✗ 1918年5月,《新青年》发表了鲁迅的《狂人日记》,这是中国现代文学史上第一篇用-e考试网 — <https://www.eepw.com/shiti/ynristewndizmjq2h4a9g.html>
- zh-04: ✓ 《克里姆林宫珍品》故宫博物院 — <https://www.dpm.org.cn/explode/others/207693.html?hl=Z>
- zh-05: ✓ 【75个地标见证共和国成长的脚步】国家图书馆（1987） — <https://cn.chinadaily.com.cn/a/202409/30/WS66fa8990a310b59111d9c65b.html>
- zh-06: ✓ 《著作权法》宣传 — <http://sfj.chifeng.gov.cn/zxdt/202201/t20220105_1550454.html>
- zh-07: ✓ 第十一届茅盾文学奖公布 5部作品获奖-新华网 — <http://www.news.cn/politics/2023-08/11/c_1129798304.htm>
- zh-08: ✗ 嫦娥六号预计在北京时间6月3日1时,在月球背面着陆(42.1S 154.4W)...__财经头条 — <https://cj.sina.com.cn/articles/view/2206258462/m8380d51e033017jg0>
- zh-09: ✗ 中国人民银行成立于什么时候? — <http://wenwen.sogou.com/z/q395277810.htm>
- zh-10: ✗ 现代汉语词典第7版正版第七版商务印书馆 现代汉语应用规范词典高-Taobao — <https://www.taobao.com/list/item/735971345852.htm>
- zh-11: ✓ 标准号:GB/T 12451-2001 — <https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=D3F64879364A05E989F28C2344DCCB24>
- zh-12: ✗ 莫高窟在(  )年,入选联合国教科文组织《世界遗产名录》。_考试资料网 — <https://www.ppkao.com/wangke/daan/1daedade519841369e9379d316c83f48>
- zh-13: ✓ 三峡工程完成整体竣工验收全部程序_新闻频道_央视网(cctv.com) — <https://news.cctv.com/2020/11/01/ARTIQQbqCeXdwjtQ88o0TrnA201101.shtml>
- zh-14: ✓ 中国当代作家协会 - 搜狗百科 — <http://baike.sogou.com/v73131309.htm?fromTitle=%E4%B8%AD%E5%9B%BD%E5%BD%93%E4%BB%A3%E4%BD%9C%E5%AE%B6%E5%8D%8F%E4%BC%9A>
- zh-15: ✗ 《汉语拼音方案》是什么时候通过决议的? 爱问知识人 — <https://iask.sina.com.cn/b/6f7bA6nQQJ.html>
- en-01: ✓ Universal Declaration of Human Rights  United Nations — <http://www.un.org/en/documents/udhr/>
- en-02: ✗ Nobel Prize in Literature for 2012: Mo Yan- China.org.cn — <http://www.china.org.cn/arts/2012-10/11/content_26766299_8.htm>
- en-03: ✗ 保护文学和艺术作品伯尔尼公约 — <https://ipr.mofcom.gov.cn/zhuanti/law/conventions/wipo/1/Berne_Convention/Berne_Convention_right.html>
- en-04: ✗ Hong Kong Public Libraries - New 13-Digit ISBNs — <https://www.hkpl.gov.hk/en/about-us/services/book-registration/13-digit.html>
- en-05: ✓ NASA’s James Webb Space Telescope to be Launched Spring 2019 - NASA — <https://www.nasa.gov/feature/nasa-s-james-webb-space-telescope-to-be-launched-spring-2019>
- en-06: ✓ Chapter 1 Contents — <https://www.chicagomanualofstyle.org/book/ed17/part1/ch01/toc.html>
- en-07: ✗ GUTENBERG BIBLE Definition & Meaning  Dictionary.com — <https://www.dictionary.com/browse/gutenberg-bible>
- en-08: ✓ The Oxford English Dictionary  Oxford Languages — <https://languages.oup.com/research/oxford-english-dictionary>
- en-09: ✓ World Book Day - Wikipedia — <https://en.wikipedia.org/wiki/World_Book_and_Copyright_Day>
- en-10: ✗ Library of Congress, Washington D.C. — <https://www.gpsmycity.com/attractions/library-of-congress-17727.html>
- en-11: ✓ Frankfurter Buchmesse  Home — <https://www.buchmesse.de/en>
- en-12: ✗ 2023 Pulitzer Prize winners revealed — <https://www.amazon.com/amazonbookreview/read/B0C4V6VR9B>
- en-13: ✗ 2024年诺贝尔文学奖即将公布，热门人选如下： — <https://m.163.com/dy/article/JE03MRKF0553ESUC.html>
- en-14: ✗ 2015 = Unicode 8.0-字体资讯-字客网触屏版 — <https://m.fontke.com/article/16814/>
- en-15: ✓ History — <https://www.who.int/about/history>

### `search-brave`

- zh-01: ✓ 中华人民共和国宪法修正案 (2018年) - 维基百科，自由的百科全书 — <https://zh.wikipedia.org/zh-hans/%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%AE%AA%E6%B3%95%E4%BF%AE%E6%AD%A3%E6%A1%88_(2018%E5%B9%B4)>
- zh-02: ✓ 第七次全国人口普查公报__中国政府网 — <https://www.gov.cn/guoqing/2021-05/13/content_5606149.htm>
- zh-03: ✓ 狂人日记（现代鲁迅创作的短篇白话文日记体小说）_百度百科 — <https://baike.baidu.com/item/%E7%8B%82%E4%BA%BA%E6%97%A5%E8%AE%B0/11577>
- zh-04: ✓ 故宫博物院成立 - 故宫博物院 — <https://www.dpm.org.cn/classify_detail/156833.html>
- zh-05: ✓ 中国国家图书馆_百度百科 — <https://baike.baidu.com/item/%E4%B8%AD%E5%9B%BD%E5%9B%BD%E5%AE%B6%E5%9B%BE%E4%B9%A6%E9%A6%86/409221>
- zh-06: ✓ 2021年中国版权十件大事-要闻信息-国家版权局 — <https://www.ncac.gov.cn/xxfb/ywxx/202201/t20220125_863920.html>
- zh-07: ✓ 第11届茅盾文学奖_百度百科 — <https://baike.baidu.com/item/%E7%AC%AC11%E5%B1%8A%E8%8C%85%E7%9B%BE%E6%96%87%E5%AD%A6%E5%A5%96/63520251>
- zh-08: ✓ 嫦娥六号任务圆满成功实现世界首次月球背面采样返回 — <https://www.cnsa.gov.cn/n6758823/n6758838/c10565180/content.html>
- zh-09: ✓ 中国人民银行 - 维基百科，自由的百科全书 — <https://zh.wikipedia.org/zh-hans/%E4%B8%AD%E5%9B%BD%E4%BA%BA%E6%B0%91%E9%93%B6%E8%A1%8C>
- zh-10: ✓ 现代汉语词典（第7版）_百度百科 — <https://baike.baidu.com/item/%E7%8E%B0%E4%BB%A3%E6%B1%89%E8%AF%AD%E8%AF%8D%E5%85%B8%EF%BC%88%E7%AC%AC7%E7%89%88%EF%BC%89/20380015>
- zh-11: ✓ 图书在版编目数据 - 全国标准信息公共服务平台 — <https://std.samr.gov.cn/gb/search/gbDetailed?id=053404E3EEBB8F91E06397BE0A0A9209>
- zh-12: ✓ 莫高窟（甘肃省敦煌市第一批全国重点文物保护单位 — <https://baike.baidu.com/item/%E8%8E%AB%E9%AB%98%E7%AA%9F/303038>
- zh-13: ✓ 三峡工程完成整体竣工验收 — <https://kjj.ezhou.gov.cn/ztzl/kjcg/202309/t20230911_574226.html>
- zh-14: ✓ 中国作家协会 — <https://baike.baidu.com/item/%E4%B8%AD%E5%9B%BD%E4%BD%9C%E5%AE%B6%E5%8D%8F%E4%BC%9A/2049478>
- zh-15: ✓ 对十三届全国人大二次会议第5457号建议的答复 - 中华人民共和国教育部政府门户网站 — <http://www.moe.gov.cn/jyb_xxgk/xxgk_jyta/jyta_yxs/201909/t20190923_400295.html>
- en-01: ✓ United Nations General Assembly Resolution 217 (III) - Wikipedia — <https://en.wikipedia.org/wiki/United_Nations_General_Assembly_Resolution_217_(III)>
- en-02: ✓ 2012 Nobel Prize in Literature - Wikipedia — <https://en.wikipedia.org/wiki/2012_Nobel_Prize_in_Literature>
- en-03: ✓ Berne Convention - Wikipedia — <https://en.wikipedia.org/wiki/Berne_Convention>
- en-04: ✓ ISBN - Wikipedia — <https://en.wikipedia.org/wiki/ISBN>
- en-05: ✓ James Webb Space Telescope - Wikipedia — <https://en.wikipedia.org/wiki/James_Webb_Space_Telescope>
- en-06: ✓ The Chicago Manual of Style - Wikipedia — <https://en.wikipedia.org/wiki/The_Chicago_Manual_of_Style>
- en-07: ✓ Gutenberg Bible - Wikipedia — <https://en.wikipedia.org/wiki/Gutenberg_Bible>
- en-08: ✓ History of the OED — <https://www.oed.com/information/about-the-oed/history-of-the-oed/>
- en-09: ✓ World Book and Copyright Day \| UNESCO — <https://www.unesco.org/en/days/world-book-and-copyright>
- en-10: ✓ Library of Congress - Wikipedia — <https://en.wikipedia.org/wiki/Library_of_Congress>
- en-11: ✓ Guest of Honour: Preview — <https://www.buchmesse.de/en/highlights/guest-honour/preview>
- en-12: ✓ The Booker Prize 2023 \| The Booker Prizes — <https://thebookerprizes.com/the-booker-library/prize-years/2023>
- en-13: ✓ Pulitzer Prizes 2024: A Guide to the Winning Books and Finalists - The New York Times — <https://www.nytimes.com/2024/05/06/books/booksupdate/pulitzer-prize-books-winners-finalists.html>
- en-14: ✓ The Unicode Blog: 622 New CJK Ideographs to be Available in Unicode Version 15.1 — <http://blog.unicode.org/2023/08/622-new-cjk-ideographs-to-be-available.html>
- en-15: ✓ Constitution of the World Health Organization — <https://www.who.int/about/governance/constitution>

### `search-deepseek`

- zh-01: ✓ 中华人民共和国宪法修正案 - 当前位置：首页 — <http://www.npc.gov.cn/npc//c2/c30834/201905/t20190521_280825.html#1>
- zh-02: ✓ 第七次全国人口普查公报（第二号） — <https://app.www.gov.cn/govdata/gov/202105/11/471242/article.html>
- zh-03: ✓ “纪念《狂人日记》发表一百周年”学术研讨会在京召开-馆讯 — <http://luxunmuseum.com.cn/html/201805/a888.htm>
- zh-04: ✓ 紫禁城建成六百年暨故宫博物院成立九十五周年 — <https://www.dpm.org.cn/subject_600/index.html?ivk_sa=1024320u#1>
- zh-05: ✓ 中国国家图书馆 · 中国国家数字图书馆 — <https://www.nlc.cn/web/dsb_footer/gygt/lsyg/index_1.shtml>
- zh-06: ✓ 著作權法修改是我國經濟社會發展的現實需要 - 著作權法修改是我國經濟社會發展的現實需要 — <http://ip.people.com.cn/BIG5/n1/2020/1117/c136655-31933700.html#1>
- zh-07: ✓ 历届茅盾文学奖获奖作品一览--文学奖项--中国作家网 - 历届茅盾文学奖获奖作品一览 — <https://www.chinawriter.com.cn/n1/2019/0816/c405645-31300293.html#1>
- zh-08: ✓ 月背“挖土” “广寒”探秘——探月工程嫦娥六号任务纪实 — <https://www.cnsa.gov.cn/n6758823/n6758844/n10518102/n10518157/c10569740/content.html#1>
- zh-09: ✓ 历史的选择——中国人民银行成立展览 — <https://shijiazhuang.pbc.gov.cn/shijiazhuang/131507/131656/131664/2503420/index.html#1#2>
- zh-10: ✓ 商务印书馆 - 仅显示在售 — <https://www.cp.com.cn/book/recommend.dhtml?=zaishou,sort,renwu,fenlei_text,fenlei_cz,ztc,sort2,sort_text&order=2#1>
- zh-11: ✓ 国家标准 - 全国标准信息公共服务平台 — <https://std.samr.gov.cn/gb/search/gbDetailed?id=053404E3EEBB8F91E06397BE0A0A9209&download=1>
- zh-12: ✓ 时光相册丨文明中国：80年，再遇敦煌 — <https://www.dha.ac.cn/info/1021/5345.htm>
- zh-13: ✓ 三峡工程完成整体竣工验收 — <http://china.cnr.cn/NewsFeeds/20201101/t20201101_525316069.shtml>
- zh-14: ✓ 中国作家协会十届十次主席团会议、十届七次全委会在京召开--新闻--中国作家网 — <https://www.chinawriter.com.cn/n1/2026/0320/c403993-40685886.html#1>
- zh-15: ✓ 教育部对十二届全国人大四次会议第1584号建议的答复 — <http://www.moe.gov.cn/jyb_xxgk/xxgk_jyta/jyta_yys/201610/t20161018_285368.html>
- en-01: ✓ Universal Declaration of Human Rights \| United Nations - Universal Declaration of Human Rights — <https://www.un.org/en/node/124305?utm_source=chatgpt.com#1>
- en-02: ✓ The Nobel Prize Award Ceremony 2012 — <https://www.nobelprize.org/ceremonies/the-nobel-prize-award-ceremony-2012-2012-2>
- en-03: ✓ BIRPI — <https://tind.wipo.int/nanna/record/43738/files/wipo_pub_berne_birpi.pdf?withWatermark=0&withMetadata=0&version=1&registerDownload=1#9#1>
- en-04: ✓ Why did ISBN users begin making New Year 2007 resolutions in 2005? — <https://gnbs.isolutions.iso.org/news/2006/10/Ref1032.html>
- en-05: ✓ Webb factsheet — <https://www.esa.int/Science_Exploration/Space_Science/Webb/Webb_factsheet>
- en-06: ✓ The Chicago Manual of Style, 18th Edition - The Chicago Manual of Style, 18th Edition — <https://press.uchicago.edu/ucp/books/book/chicago/C/bo213648716.html#1>
- en-07: ✓ The Gutenberg Bible - Library of Congress Bible Collection \| Exhibitions — <https://www.loc.gov/exhibits/bibles/the-gutenberg-bible.html>
- en-08: ✓ Words as old as the OED — <https://www.oed.com/discover/words-as-old-as-the-oed/?tl=true>
- en-09: ✓ Statement of H.E. Mr. Jan Kavan, President of the 57th Session of the General Assembly, on World Boo — <https://www.un.org/en/ga/president/57/pdf/statements/20030423-copyright.pdf#1#1>
- en-10: ✓ Library of Congress Fact Sheet — <https://www.loc.gov/item/prn-16-A05/>
- en-11: ✓ Guest of Honour: Past guests — <https://www.buchmesse.de/en/highlights/guest-honour/past-guests>
- en-12: ✓ The Booker Prize 2023 \| The Booker Prizes - The Booker Prize 2023 — <https://thebookerprizes.com/the-booker-library/prize-years/2023#1>
- en-13: ✗ Award Winners: Pulitzer Prize in Fiction — <https://www.library.ca.gov/uploads/2024/12/Award-Winners-Pulitzer-Prize-in-Fiction.docx#4#1>
- en-14: ✓ Announcing The Unicode® Standard, Version 15.1 — <https://blog.unicode.org/2023/09/announcing-unicode-standard-version-151.html?_x_tr_sch=http>
- en-15: ✓ Global Health Histories – understanding the history of health — <https://www.who.int/about/history?utm_source=billionhands&utm_medium=clickout&utm_campaign=69cf6c470a4a8964f2ae8990&utm_content=Eventos+hist%C3%B3ricos+que+moldearon+la+salud+p%C3%BAblica+global&utm_t>

### `search-parallel`

- zh-01: ✓ 中华人民共和国宪法修正案 (2018年) - 维基百科，自由的百科全书 — <https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%AE%AA%E6%B3%95%E4%BF%AE%E6%AD%A3%E6%A1%88_(2018%E5%B9%B4)>
- zh-02: ✓ 全国人口普查公报 - 国家统计局 — <https://www.stats.gov.cn/sj/tjgb/rkpcgb/qgrkpcgb/>
- zh-03: ✓ 狂人日记（现代鲁迅创作的短篇白话文日记体小说）_百度百科 — <https://baike.baidu.com/item/%E7%8B%82%E4%BA%BA%E6%97%A5%E8%AE%B0/11577>
- zh-04: ✓ 故宫博物院成立 - 故宫博物院 — <https://www.dpm.org.cn/classify_detail/156833.html>
- zh-05: ✓ 中国国家图书馆 - 百度百科 — <https://baike.baidu.com/item/%E4%B8%AD%E5%9B%BD%E5%9B%BD%E5%AE%B6%E5%9B%BE%E4%B9%A6%E9%A6%86/409221>
- zh-06: ✓ 中华人民共和国著作权法 - 中国政府网 — <https://www.gov.cn/guoqing/2021-10/29/content_5647633.htm>
- zh-07: ✓ 第11届茅盾文学奖 - 百度百科 — <https://baike.baidu.com/item/%E7%AC%AC11%E5%B1%8A%E8%8C%85%E7%9B%BE%E6%96%87%E5%AD%A6%E5%A5%96/63520251>
- zh-08: ✓ 嫦娥六號- 維基百科，自由的百科全書 — <https://zh.wikipedia.org/wiki/%E5%AB%A6%E5%A8%A5%E5%85%AD%E5%8F%B7>
- zh-09: ✓ 中国人民银行宣告成立（1948年12月1日）_百度百科 — <https://baike.baidu.com/item/%E4%B8%AD%E5%9B%BD%E4%BA%BA%E6%B0%91%E9%93%B6%E8%A1%8C%E5%AE%A3%E5%91%8A%E6%88%90%E7%AB%8B%EF%BC%881948%E5%B9%B412%E6%9C%881%E6%97%A5%EF%BC%89/56666830>
- zh-10: ✓ 现代汉语词典（第7版） - 百度百科 — <https://baike.baidu.com/item/%E7%8E%B0%E4%BB%A3%E6%B1%89%E8%AF%AD%E8%AF%8D%E5%85%B8%EF%BC%88%E7%AC%AC7%E7%89%88%EF%BC%89/20380015>
- zh-11: ✓ 国家标准\|GB/T 12451-2023 - 国家标准全文公开 — <https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=4AF9725FBE25C9A878BAC0D0CA8E119D>
- zh-12: ✓ 敦煌（中国甘肃省西部的历史文化遗址）_百度百科 — <https://baike.baidu.com/item/%E6%95%A6%E7%85%8C/68621862>
- zh-13: ✓ 历史性时刻！三峡工程完成整体竣工验收 — <https://m.thepaper.cn/baijiahao_9809361>
- zh-14: ✓ 铁凝（第二十届中央委员，第十四届全国人大常委会副委员长，中国文学... — <https://baike.baidu.com/item/%E9%93%81%E5%87%9D/5773>
- zh-15: ✓ 汉语拼音方案 - 中华人民共和国教育部政府门户网站 — <https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/195802/t19580201_186000.html>
- en-01: ✓ Universal Declaration of Human Rights - Wikipedia — <https://en.wikipedia.org/wiki/Universal_Declaration_of_Human_Rights>
- en-02: ✓ 2012 Nobel Prize in Literature - Wikipedia — <https://en.wikipedia.org/wiki/2012_Nobel_Prize_in_Literature>
- en-03: ✓ Berne Convention for the Protection of Literary and Artistic Works — <https://www.wipo.int/en/web/treaties/ip/berne/index>
- en-04: ✓  ISO 2108:2017 - Information and documentation — International Standard Book Number (ISBN) — <https://www.iso.org/standard/65483.html>
- en-05: ✓ Launch - NASA Science — <https://science.nasa.gov/mission/webb/launch>
- en-06: ✓ The Chicago Manual of Style - Wikipedia — <https://en.wikipedia.org/wiki/The_Chicago_Manual_of_Style>
- en-07: ✓ Gutenberg Bible — <https://en.wikipedia.org/wiki/Gutenberg_Bible>
- en-08: ✓ OED Editions — <https://www.oed.com/information/about-the-oed/history-of-the-oed/oed-editions>
- en-09: ✓ World Book Day - Wikipedia — <https://en.wikipedia.org/wiki/World_Book_Day>
- en-10: ✓ Library of Congress — <https://en.wikipedia.org/wiki/Library_of_Congress>
- en-11: ✓ Our Guests of Honour over the coming years — <https://www.buchmesse.de/en/highlights/guest-honour/preview>
- en-12: ✓ The Booker Prize 2023 — <https://thebookerprizes.com/the-booker-library/prize-years/2023>
- en-13: ✓ 2024 Prize Winners and Finalists \| The Pulitzer Prizes — <https://www.pulitzer.org/prize-winners-by-year/2024>
- en-14: ✓ Unicode® 15.1.0 — <https://www.unicode.org/versions/Unicode15.1.0/>
- en-15: ✓ Constitution of the World Health Organization — <https://www.who.int/about/governance/constitution>

### `search-tinyfish`

- zh-01: ✓ 中华人民共和国宪法修正案(2018年) - 维基百科 — <https://zh.wikipedia.org/zh-hans/%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%AE%AA%E6%B3%95%E4%BF%AE%E6%AD%A3%E6%A1%88_(2018%E5%B9%B4)>
- zh-02: ✓ 全国人口普查公报 — <https://www.stats.gov.cn/sj/tjgb/rkpcgb/qgrkpcgb/>
- zh-03: ✓ 鲁迅与《新青年》 - 党史- 人民网 — <http://dangshi.people.com.cn/n/2015/0914/c85037-27580735.html>
- zh-04: ✓ 故宫博物院- 维基百科，自由的百科全书 — <https://zh.wikipedia.org/zh-hans/%E6%95%85%E5%AE%AB%E5%8D%9A%E7%89%A9%E9%99%A2>
- zh-05: ✓ 以传承民族文化，吸收先进科学。1909年9月9日清政府 ... — <https://www.nlc.cn/web/dsb_footer/gygt/lsyg/index_1.shtml>
- zh-06: ✓ 中华人民共和国著作权法（2020修正） — <https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=87976>
- zh-07: ✓ 历届茅盾文学奖获奖作品一览 — <https://www.chinawriter.com.cn/n1/2019/0816/c405645-31300293.html>
- zh-08: ✓ 嫦娥六号- 维基百科，自由的百科全书 — <https://zh.wikipedia.org/zh-hans/%E5%AB%A6%E5%A8%A5%E5%85%AD%E5%8F%B7>
- zh-09: ✓ 中国人民银行- 维基百科，自由的百科全书 — <https://zh.wikipedia.org/zh-hans/%E4%B8%AD%E5%9B%BD%E4%BA%BA%E6%B0%91%E9%93%B6%E8%A1%8C>
- zh-10: ✓ 现代汉语词典（第7版） 精装 — <https://www.cp.com.cn/book/6afc8cd8-c.html>
- zh-11: ✓ 国家标准\|GB/T 12451-2023 — <https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=4AF9725FBE25C9A878BAC0D0CA8E119D>
- zh-12: ✓ 莫高窟简介 — <https://www.dha.ac.cn/info/1425/3659.htm>
- zh-13: ✓ “国之重器”三峡工程完成整体竣工验收 — <http://www.sasac.gov.cn/n2588025/n2588124/c15848069/content.html>
- zh-14: ✓ 铁凝（第二十届中央委员，第十四届全国人大常委会副委员长，中国文学... — <https://baike.baidu.com/item/%E9%93%81%E5%87%9D/5773>
- zh-15: ✓ 教育部国家语言文字工作委员会关于印发陈至立国务委员在 ... — <http://www.moe.gov.cn/jyb_xxgk/gk_gbgg/moe_0/moe_1/moe_3/tnull_5362.html>
- en-01: ✓ Universal Declaration of Human Rights — <https://www.un.org/en/about-us/universal-declaration-of-human-rights>
- en-02: ✓ Mo Yan – Facts — <https://www.nobelprize.org/prizes/literature/2012/yan/facts/>
- en-03: ✓ Berne Convention for the Protection of Literary and Artistic ... — <https://www.wipo.int/en/web/treaties/ip/berne/index>
- en-04: ✓ ISBNs — <https://en.wikipedia.org/wiki/ISBN>
- en-05: ✓ James Webb Space Telescope — <https://science.nasa.gov/mission/webb/>
- en-06: ✓ What's New in the 18th Edition — <https://www.chicagomanualofstyle.org/help-tools/what-s-new.html>
- en-07: ✓ Gutenberg Bible — <https://en.wikipedia.org/wiki/Gutenberg_Bible>
- en-08: ✓ OED Editions — <https://www.oed.com/information/about-the-oed/history-of-the-oed/oed-editions/>
- en-09: ✓ World Book and Copyright Day — <https://www.unesco.org/en/days/world-book-and-copyright>
- en-10: ✓ History of the Library of Congress \| About ... — <https://www.loc.gov/about/history-of-the-library/>
- en-11: ✓ Meet the past Guests of Honour of Frankfurter Buchmesse. — <https://www.buchmesse.de/en/highlights/guest-honour/past-guests>
- en-12: ✓ The Booker Prize 2023 — <https://thebookerprizes.com/the-booker-library/prize-years/2023>
- en-13: ✓ 2024 Prize Winners and Finalists — <https://www.pulitzer.org/prize-winners-by-year/2024>
- en-14: ✓ 622 New CJK Ideographs to be Available in Unicode ... — <http://blog.unicode.org/2023/08/622-new-cjk-ideographs-to-be-available.html>
- en-15: ✓ Constitution of the World Health Organization — <https://www.who.int/about/governance/constitution>
