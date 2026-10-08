import type { InitialEvaluationMarketProjection } from '../../src/shared/protocol.js';

/**
 * The market section of the authored fixture `sample1-evaluation-authored` (Issue #429, plan slice S81b2; EVAL-009): only what
 * the authored observations say of exact `sample1` itself — no sales figure, no other house's book, no award record — so 市场回报
 * is 暂无法预测 and 评奖可能性 states its in-book basis. The generator writes it into the synthesis; the suites and J-11 read it back.
 */
export const AUTHORED_MARKET: InitialEvaluationMarketProjection = {
  readers: ['对考古、青铜器与古文字题材有兴趣的成年读者。', '关注学界人情、学术与名利之争的知识分子读者。'],
  sellingPoints: ['以一封甲骨文来信开篇设下悬念，学术悬疑贯穿始终。', '学者之间的对白各具声口，写出学界中人的性情与分寸。'],
  channels: ['可从书中的考古与青铜器话题切入，面向文史爱好者推介。', '以学术与名利的冲突为话题，组织书评与读书会讨论。'],
  marketReturn: null,
  awards: {
    statement: '有参评文学奖的潜力，但确定性低。',
    basis: '所读部分叙述凝练、意象运用纯熟，并触及学术与权力的主题；没有对比任何获奖作品。',
  },
};
