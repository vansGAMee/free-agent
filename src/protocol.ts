import crypto from 'node:crypto';
export type Action={type:'WRITE'|'PATCH'|'DELETE';path:string;content:string}|{type:'COMMAND';command:string}|{type:'DONE';done:boolean};
export interface Turn { nonce:string; turnId:number; actions:Action[] }
export function nonce(){return crypto.randomBytes(6).toString('hex')}
export function markers(n:string,t:number){return {begin:`<<<FA_BEGIN:${n}:${t}>>>`,end:`<<<FA_END:${n}:${t}>>>`}}
export function parseTurn(raw:string,n:string,t:number):Turn {
 const normalized=raw.replace(/\r\n/g,'\n').replace(/^\s*```[^\n]*\n/,'').replace(/\n```\s*$/,''); const m=markers(n,t);
 const starts=[...normalized.matchAll(new RegExp(escapeRe(m.begin),'g'))]; const ends=[...normalized.matchAll(new RegExp(escapeRe(m.end),'g'))];
 if(!starts.length||!ends.length)throw new Error('Missing matching FreeAgent sentinels'); const start=starts.at(-1)!.index!+m.begin.length; const end=ends.find(x=>x.index!>=start)?.index;
 if(end===undefined)throw new Error('Incomplete FreeAgent block'); const body=normalized.slice(start,end); const block=/<<<(WRITE|PATCH|DELETE|COMMAND|DONE)(?: path="([^"]+)")?>>>([\s\S]*?)<<<END_\1>>>/g;
 const actions:Action[]=[]; let cursor=0,match:RegExpExecArray|null;
 while((match=block.exec(body))){if(body.slice(cursor,match.index).trim())throw new Error('Unexpected protocol content'); const type=match[1] as Action['type']; const content=match[3].replace(/^\n|\n$/g,'');
  if(type==='WRITE'||type==='PATCH'||type==='DELETE'){if(!match[2])throw new Error(`${type} requires path`);if(type==='DELETE'&&content.trim())throw new Error('DELETE must be empty');actions.push({type,path:match[2],content});}
  else if(type==='COMMAND'){if(match[2]||!content.trim())throw new Error('Malformed COMMAND');actions.push({type,command:content.trim()});}
  else {if(!/^(true|false)$/i.test(content.trim()))throw new Error('Malformed DONE');actions.push({type,done:content.trim().toLowerCase()==='true'});} cursor=block.lastIndex;
 }
 if(body.slice(cursor).trim()||!actions.length)throw new Error('Malformed or empty protocol'); if(actions.filter(a=>a.type!=='DONE').length>3)throw new Error('More than 3 mutating actions'); return {nonce:n,turnId:t,actions};
}
const escapeRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
