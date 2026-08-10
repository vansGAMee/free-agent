import path from 'node:path'; import fs from 'node:fs/promises';
export async function safePath(root:string,relative:string,forCreate=false){
 if(!relative||path.win32.isAbsolute(relative)||path.posix.isAbsolute(relative)||relative.includes('\0'))throw new Error(`Unsafe path: ${relative}`);
 const base=path.resolve(root), target=path.resolve(base,relative); if(target!==base&&!target.startsWith(base+path.sep))throw new Error(`Path escapes project: ${relative}`);
 let probe=forCreate?path.dirname(target):target; while(true){try{const real=await fs.realpath(probe);if(real!==base&&!real.startsWith(base+path.sep))throw new Error(`Symlink escapes project: ${relative}`);break}catch(e:any){if(e.code!=='ENOENT')throw e;const parent=path.dirname(probe);if(parent===probe)throw e;probe=parent;}}
 return target;
}
const allowed=new Set(['node','npm','npm.cmd','npx','npx.cmd','pnpm','pnpm.cmd','yarn','yarn.cmd','bun','git','git.exe','python','python.exe','python3','pip','pip3','pytest','cargo','go']);
export function parseCommand(input:string){if(/[|;&<>`\n\r]/.test(input)||/\$\(|\|\|/.test(input))throw new Error('Shell composition is not allowed');const argv=input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(x=>x.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/,'$1$2'))||[];if(!argv.length||!allowed.has(argv[0].toLowerCase()))throw new Error(`Executable not allowed: ${argv[0]||''}`);return {file:argv[0],args:argv.slice(1)};}
