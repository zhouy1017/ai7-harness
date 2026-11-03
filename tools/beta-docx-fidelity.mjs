/** Manual Beta oracle: keep table presentation while permitting exported review-comment anchors. */
import { createHash } from 'node:crypto';
import { strFromU8 } from 'fflate';
import { SaxesParser } from 'saxes';

const WORD='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const name=local=>`{${WORD}}${local}`;
const COMMENT=new Set(['commentRangeStart','commentRangeEnd','commentReference'].map(name));
const digest=value=>createHash('sha256').update(value).digest('hex');

export function wordTablePresentation(files){
 const tables=[],stack=[],references=[];let active=false;
 const parser=new SaxesParser({xmlns:true});
 parser.on('opentag',tag=>{
  if(!active&&tag.uri===WORD&&tag.local==='tbl')active=true;
  if(!active)return;
  const node={name:`{${tag.uri}}${tag.local}`,attrs:Object.values(tag.attributes).filter(a=>a.uri!=='http://www.w3.org/2000/xmlns/').map(a=>[`{${a.uri}}${a.local}`,a.value]).sort((a,b)=>a[0].localeCompare(b[0])),children:[]};
  if(COMMENT.has(node.name))references.push({kind:tag.local,id:Object.values(tag.attributes).find(a=>a.uri===WORD&&a.local==='id')?.value});
  if(stack.length)stack.at(-1).children.push(node);stack.push(node);
 });
 parser.on('text',text=>{if(!stack.length)return;const node=stack.at(-1);if(!text.trim()&&![name('t'),name('instrText'),name('delText')].includes(node.name))return;const last=node.children.at(-1);if(typeof last==='string')node.children[node.children.length-1]+=text;else node.children.push(text);});
 parser.on('closetag',()=>{if(!active)return;const node=stack.pop();if(!stack.length){tables.push(node);active=false;}});
 parser.write(strFromU8(files['word/document.xml'])).close();
 const normalize=node=>{
  if(typeof node==='string')return node;
  if(COMMENT.has(node.name))return null;
  const children=node.children.map(normalize).filter(n=>n!==null);
  if(node.name===name('r')){
   const visible=children.filter(n=>typeof n==='string'||n.name!==name('rPr'));
   if(!visible.length)return null; // A comment-reference-only run has no visible table content.
   if(visible.every(n=>typeof n!=='string'&&n.name===name('t'))){
    return {text:visible.map(t=>{const value=t.children.join('');return t.attrs.some(([key,v])=>key==='{http://www.w3.org/XML/1998/namespace}space'&&v==='preserve')?value:value.trim();}).join(''),
     format:JSON.stringify({attrs:node.attrs,properties:children.filter(n=>typeof n!=='string'&&n.name===name('rPr')),textAttributes:visible.map(t=>t.attrs.filter(([key])=>key!=='{http://www.w3.org/XML/1998/namespace}space'))[0]??[]})};
   }
  }
  const merged=[];
  for(const child of children){const prior=merged.at(-1);if(child&&typeof child==='object'&&'text'in child&&prior&&typeof prior==='object'&&prior.format===child.format)prior.text+=child.text;else merged.push(child);}
  return {name:node.name,attrs:node.attrs,children:merged};
 };
 const comments=new Set();
 if(files['word/comments.xml']){const p=new SaxesParser({xmlns:true});p.on('opentag',tag=>{if(tag.uri===WORD&&tag.local==='comment')comments.add(Object.values(tag.attributes).find(a=>a.uri===WORD&&a.local==='id')?.value);});p.write(strFromU8(files['word/comments.xml'])).close();}
 const ids=[...new Set(references.map(r=>r.id))];
 return {count:tables.length,presentationSha256:digest(JSON.stringify(tables.map(normalize))),commentIds:ids,
  commentsResolve:ids.every(id=>id!==undefined&&comments.has(id)&&['commentRangeStart','commentRangeEnd','commentReference'].every(kind=>references.filter(r=>r.id===id&&r.kind===kind).length===1))};
}
