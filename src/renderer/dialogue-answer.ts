/** Prefer an explicitly rewritten passage; leave plain answers editable when no passage is singled out. */
export function dialogueReplacementText(answer: string): string {
  answer = answer.replace(/\[retrieval:[0-9a-f]{64}\]/gu, '').trim();
  const fenced = [...answer.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/gu)].filter((match) => match[1]?.trim()).at(-1);
  if (fenced?.[1]) return fenced[1].trim();
  const rewrite = /(?:建议改为|改写(?:为|如下)?|修改后|润色后|替换为)[\s*：:]*(?:[“「『"]([\s\S]+?)[”」』"]|([^\n]+))/u.exec(answer);
  if (rewrite !== null) return (rewrite[1] ?? rewrite[2] ?? '').trim();
  const quoted = /[“「『"]([^”」』"]+)[”」』"]/gu;
  const quotes = [...answer.matchAll(quoted)];
  if (quotes.length === 1) return quotes[0]![1]!.trim();
  return answer.trim();
}
