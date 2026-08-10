import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface Settings { defaultProvider: string; browserExecutable: string | null; maxTurns: number; commandTimeoutMs: number }
export const defaults: Settings = { defaultProvider: 'deepseek', browserExecutable: null, maxTurns: 12, commandTimeoutMs: 120000 };
export function appDir(platform = process.platform, env = process.env, home = os.homedir()) {
  return platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'FreeAgent') : path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'freeagent');
}
export async function loadSettings(): Promise<Settings> { try { return {...defaults, ...JSON.parse(await fs.readFile(path.join(appDir(), 'config.json'), 'utf8'))}; } catch { return {...defaults}; } }
export async function ensureAppDir() { const d=appDir(); await fs.mkdir(d,{recursive:true}); return d; }
export function projectId(root:string){ return crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0,16); }
