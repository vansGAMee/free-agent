import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {ensureAppDir} from './config.js';
export type Phase='IDLE'|'PREPARING'|'SENDING'|'WAITING_MODEL'|'PARSING'|'EXECUTING'|'VERIFYING'|'REPAIRING'|'VERIFIED'|'FAILED'|'CANCELLED';
export interface Session{id:string;projectRoot:string;provider:string;task:string;phase:Phase;turn:number;committed:string[];startedAt:string;lastError?:string}
export async function newSession(root:string,provider:string,task:string){const s:Session={id:crypto.randomUUID(),projectRoot:root,provider,task,phase:'IDLE',turn:0,committed:[],startedAt:new Date().toISOString()};await saveSession(s);return s}
export async function saveSession(s:Session){const d=path.join(await ensureAppDir(),'sessions');await fs.mkdir(d,{recursive:true});await fs.writeFile(path.join(d,`${s.id}.json`),JSON.stringify(s,null,2))}
export async function setPhase(s:Session,p:Phase){s.phase=p;await saveSession(s)}
