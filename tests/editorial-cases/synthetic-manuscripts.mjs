/**
 * The two synthetic manuscripts of the editorial case set (Issue #812). Both are public synthetic material written for
 * this case set: no sentence comes from sample1, a private manuscript or any other Book (wave-5 Owner decision §2,
 * ADR 0043/0079 §5). Each is generated deterministically from a clean authored text and a declared injection table, so
 * every expected concern's anchor — paragraph position, grapheme range and the digest of the injected words — is computed
 * here rather than typed into a case file, and a change to either side moves the case's recorded digests visibly.
 *
 * A manuscript is a list of paragraphs; paragraph `n` (1-based) is block `n` of the imported Book, because the product's
 * DOCX reader keeps every non-empty paragraph as one block in order. An injection replaces the first occurrence of
 * `clean` in its paragraph with `injected`; it must occur exactly once, so the anchor is unambiguous. A trap names words
 * that are correct as written and must not be "corrected": the case set's false-positive checks.
 *
 * Plain ESM, so `tools/editorial-evidence.mjs` and the bundled TypeScript runner read the same bytes.
 */
import { createHash } from 'node:crypto';

const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });

export function graphemeLength(text) {
  return [...segmenter.segment(text)].length;
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 合成稿甲《灯塔守望人》: a short story carrying injected 错别字与规范用语 defects. */
const LIGHTHOUSE = {
  id: 'synthetic-lighthouse',
  title: '灯塔守望人',
  paragraphs: [
    { text: '灯塔守望人', style: 'Title' },
    { text: '老周在岬角的灯塔上守了整整三十年。每天傍晚，他都会沿着螺旋楼梯爬上塔顶，仔细地擦拭那面巨大的透镜，再把当天的风向记进本子。' },
    { text: '镇上的人都说他脾气古怪，其实他只是不习惯与人寒暄。有人问他一个人守塔闷不闷，他总是摆摆手说：“俺不晓得啥叫闷，海天天都不一样。”' },
    { text: '那年秋天，一位年轻的气象员被派到岬角，协助老周记录潮汐和风向。年轻人名叫林远，刚从学校毕业，对一切都充满好奇，的确给灯塔添了不少生气。' },
    { text: '两个人在灯塔里度过了第一个冬天。夜里北风呼啸，林远常常睡不着，老周就给他讲早年航船遇险的旧事，讲到要紧处，炉子里的炭火也跟着噼啪作响。' },
    { text: '老周定下的规矩只有一条：即使风浪再大，灯也不能灭。林远起初觉得这条规矩过于死板，后来才明白，海上的船只全凭这一点光辨认方向。' },
    { text: '开春以后，镇上拨来一笔经费修缮塔身。老周把其中一部分钱用来更换生锈的栏杆，剩下的全都买了新的灯泡和备用电池。' },
    { text: '林远渐渐发现，老周守塔的样子像一盏灯本身：不声不响，却从不缺席。他把这句话写进日记，又觉得有些矫情，便用铅笔轻轻划掉了。' },
    { text: '毕竟是第一次独自值夜，林远在塔顶坐到天亮，一刻也不敢合眼。老周早上上来换班，看见他眼里的血丝，只是笑了笑，没有多说什么。' },
    { text: '截至今年夏天，灯塔已经连续工作了一万多个夜晚。气象站的报表上，这个数字被林远用红笔圈了出来。' },
    { text: '气象站发来通知，新的自动观测设备将在年底安装，申请留任的截止日期是十月底。林远把通知读了两遍，没有马上告诉老周。' },
    { text: '那天傍晚，老周照旧爬上塔顶擦拭透镜。林远站在楼梯口看着他的背影，忽然觉得，有些事情比数字更值得记录下来。' },
  ],
  injections: [
    { id: 'lh-de-di', paragraph: 2, clean: '仔细地擦拭', injected: '仔细的擦拭', category: 'typos-and-usage', concern: '状语后的结构助词应为“地”' },
    { id: 'lh-du-du', paragraph: 5, clean: '度过了第一个冬天', injected: '渡过了第一个冬天', category: 'typos-and-usage', concern: '经历一段时间应为“度过”' },
    { id: 'lh-ji-ji', paragraph: 6, clean: '即使风浪再大', injected: '既使风浪再大', category: 'typos-and-usage', concern: '让步连词应为“即使”' },
    { id: 'lh-bu-fen', paragraph: 7, clean: '一部分钱', injected: '一部份钱', category: 'typos-and-usage', concern: '规范词形为“部分”' },
    { id: 'lh-xiang', paragraph: 8, clean: '样子像一盏灯', injected: '样子象一盏灯', category: 'typos-and-usage', concern: '表示相似应为“像”' },
    { id: 'lh-bi-jing', paragraph: 9, clean: '毕竟是第一次', injected: '必竟是第一次', category: 'typos-and-usage', concern: '错字，应为“毕竟”' },
    { id: 'lh-jie-zhi', paragraph: 10, clean: '截至今年夏天', injected: '截止今年夏天', category: 'typos-and-usage', concern: '表示到某时为止应为“截至”' },
  ],
  traps: [
    { id: 'lh-dialect', paragraph: 3, words: '俺不晓得啥叫闷', reason: '人物方言对白，按原样保留' },
    { id: 'lh-di-que', paragraph: 4, words: '的确给灯塔', reason: '“的确”为正确用法，不是“地”的误用' },
    { id: 'lh-jie-zhi-ri-qi', paragraph: 11, words: '截止日期', reason: '“截止日期”为正确用法' },
  ],
};

/** 合成稿乙《一座县城博物馆》: a nonfiction essay carrying injected 文风与格式（体例）defects. */
const MUSEUM = {
  id: 'synthetic-museum',
  title: '一座县城博物馆',
  paragraphs: [
    { text: '一座县城博物馆', style: 'Title' },
    { text: '青川县博物馆坐落在老城区的东门外，建于一九五八年，是本省最早的县级博物馆之一。馆舍原是一座清代书院，几经修缮，仍保留着前后两进的格局。' },
    { text: '馆藏文物共有三千余件，其中陶瓷器占一半以上。最受观众喜爱的是一件宋代青白釉执壶，壶身线条流畅，釉色温润如玉。' },
    { text: '一九八五年，博物馆进行了第一次大规模扩建，新建的陈列楼面积达两千平方米。扩建工程由县文化局主持，历时两年完成。' },
    { text: '老馆长常说，博物馆的“家底”不在库房里，而在一代代讲解员的嘴上。他要求每位讲解员都能把十件重点文物的来历讲清楚。' },
    { text: '陈列楼二层的地方史展厅按时间顺序布置，从新石器时代的石斧一直排到民国时期的商号招牌。观众走完一圈，大约需要四十分钟。' },
    { text: '每逢节假日，展厅里挤满了从各乡镇赶来的观众。有人在执壶前驻足良久，有人只是匆匆走过……讲解员说，这两种人都值得欢迎。' },
    { text: '二〇一九年，县里决定为博物馆建设数字展厅。项目组用了一年时间为馆藏文物逐件拍照、建档，青川县博物馆由此成为全省第一批完成数字化建档的县级博物馆。' },
    { text: '从博物馆步行到江边的古码头遗址，全程约三公里，沿途立有十二块说明牌。每块说明牌都引用了《青川县志》的相关记载。' },
    { text: '县志里记载的第一次大洪水发生在明代万历年间，馆里保存的一块水位碑就是那次洪水的实物见证。' },
    { text: '展柜编号为A-12的玻璃柜里，陈列着一张一九三六年绘制的县城地图，比例尺为1∶5000，是馆藏中最早的测绘资料。' },
    { text: '博物馆的故事还在继续。新馆长说，下一步要把讲解员口中的“家底”录成音频，让更多人能够听到。' },
  ],
  injections: [
    { id: 'mu-half-width-comma', paragraph: 3, clean: '三千余件，其中', injected: '三千余件,其中', category: 'style-and-format', concern: '中文行文中误用半角逗号' },
    { id: 'mu-numeral-style', paragraph: 4, clean: '一九八五年，', injected: '1985年，', category: 'style-and-format', concern: '年份数字写法与全文汉字数字体例不一致' },
    { id: 'mu-quote-marks', paragraph: 5, clean: '“家底”', injected: '「家底」', category: 'style-and-format', concern: '引号形式与全文“”体例不一致' },
    { id: 'mu-ellipsis', paragraph: 7, clean: '匆匆走过……', injected: '匆匆走过...', category: 'style-and-format', concern: '省略号应为中文“……”' },
    { id: 'mu-institution-name', paragraph: 8, clean: '青川县博物馆由此', injected: '青川县博物院由此', category: 'style-and-format', concern: '同一机构名称前后不一致（博物馆/博物院）' },
    { id: 'mu-unit-symbol', paragraph: 9, clean: '全程约三公里', injected: '全程约3km', category: 'style-and-format', concern: '数字与单位符号之间缺少空格，且与本文中文数量写法不一致；不把 km 符号本身判作错误' },
  ],
  traps: [
    { id: 'mu-case-number', paragraph: 11, words: 'A-12', reason: '展柜编号，字母与连字符按原样保留' },
    { id: 'mu-scale-ratio', paragraph: 11, words: '1∶5000', reason: '比例尺按国家标准使用比号与阿拉伯数字' },
    { id: 'mu-recorded-year', paragraph: 8, words: '二〇一九年', reason: '汉字数字年份与全文体例一致' },
    { id: 'mu-generic-gazetteer', paragraph: 10, words: '县志里记载', reason: '县志是上文所提文献的泛称，不是正式书名，不必加书名号' },
  ],
};

const MANUSCRIPTS = new Map([LIGHTHOUSE, MUSEUM].map((manuscript) => [manuscript.id, manuscript]));

export const SYNTHETIC_MANUSCRIPT_IDS = [...MANUSCRIPTS.keys()];

function locate(text, words, label) {
  const at = text.indexOf(words);
  if (at < 0 || text.indexOf(words, at + 1) >= 0) throw new Error(`EDITORIAL_CASE/synthetic-anchor-ambiguous: ${label}`);
  const from = graphemeLength(text.slice(0, at));
  return { from, to: from + graphemeLength(words) };
}

/**
 * The generated manuscript: its paragraphs after injection, each defect's anchor and each trap's anchor. An injection whose
 * clean words are missing or repeated, or a trap the injections disturbed, refuses rather than yielding a moved anchor.
 */
export function generateSyntheticManuscript(id) {
  const manuscript = MANUSCRIPTS.get(id);
  if (manuscript === undefined) throw new Error(`EDITORIAL_CASE/synthetic-unknown: ${id}`);
  const paragraphs = manuscript.paragraphs.map((paragraph) => ({ ...paragraph }));
  const defects = manuscript.injections.map((injection) => {
    const index = injection.paragraph - 1;
    const before = paragraphs[index].text;
    locate(before, injection.clean, injection.id);
    const after = injection.anchorOnly === true ? before : before.replace(injection.clean, injection.injected);
    paragraphs[index] = { ...paragraphs[index], text: after };
    const range = locate(after, injection.injected, injection.id);
    return {
      id: injection.id, paragraph: injection.paragraph, category: injection.category, concern: injection.concern,
      from: range.from, to: range.to, spanSha256: sha256Hex(injection.injected), correction: injection.anchorOnly === true ? null : injection.clean,
    };
  });
  const traps = manuscript.traps.map((trap) => {
    const range = locate(paragraphs[trap.paragraph - 1].text, trap.words, trap.id);
    return { id: trap.id, paragraph: trap.paragraph, reason: trap.reason, from: range.from, to: range.to, spanSha256: sha256Hex(trap.words) };
  });
  const text = paragraphs.map((paragraph) => paragraph.text).join('\n');
  return { id, title: manuscript.title, paragraphs, defects, traps, textSha256: sha256Hex(text) };
}
