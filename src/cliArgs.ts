const optionsWithValues=new Set(['--project','--provider','--task','--url','--browser']);
export function optionValue(args:string[],name:string){const i=args.indexOf(name);return i>=0?args[i+1]:undefined}
export function positionalProject(args:string[]){for(let i=0;i<args.length;i++){const arg=args[i];if(optionsWithValues.has(arg)){i++;continue}if(!arg.startsWith('-'))return arg}return undefined}
