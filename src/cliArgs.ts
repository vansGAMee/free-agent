import path from 'node:path';

const optionsWithValues=new Set(['--project','--provider','--task','--url','--browser']);
export function optionValue(args:string[],name:string){const i=args.indexOf(name);return i>=0?args[i+1]:undefined}
export function positionalProject(args:string[]){for(let i=0;i<args.length;i++){const arg=args[i];if(optionsWithValues.has(arg)){i++;continue}if(!arg.startsWith('-'))return arg}return undefined}

function positionalArgs(args:string[]){const values:string[]=[];for(let i=0;i<args.length;i++){const arg=args[i];if(optionsWithValues.has(arg)){i++;continue}if(!arg.startsWith('-'))values.push(arg)}return values}
function looksLikePath(value:string){return value==='.'||value==='..'||path.isAbsolute(value)||/^\.{1,2}[\\/]/.test(value)}

export interface CliInvocation{project:string;task:string;plain:boolean;help:boolean;version:boolean}
export function parseCliInvocation(args:string[],cwd=process.cwd()):CliInvocation{
 const help=args.includes('--help')||args.includes('-h'),version=args.includes('--version')||args.includes('-v'),plain=args.includes('--plain');
 if(help||version)return {project:cwd,task:'',plain,help,version};
 const explicitProject=optionValue(args,'--project'),explicitTask=optionValue(args,'--task'),positionals=positionalArgs(args);
 let project=explicitProject||cwd,task=explicitTask||'';
 if(explicitTask){if(!explicitProject&&positionals.length)project=positionals[0]}
 else if(positionals.length>1&&looksLikePath(positionals[0])){project=positionals[0];task=positionals.slice(1).join(' ')}
 else if(positionals.length===1&&looksLikePath(positionals[0]))task='';
 else task=positionals.join(' ');
 if(!task.trim())throw new Error('Task is required. Example: freecodex . "Create a responsive landing page"');
 return {project,task:task.trim(),plain,help,version};
}
