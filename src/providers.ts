export interface ProviderAdapter { id:string; url:string; inputHints:string[]; sendHints:string[]; loginHints:string[]; enterSubmits:boolean; timeoutMs:number }
const common={sendHints:['send','submit','отправить'],enterSubmits:true,timeoutMs:300_000};
export const providers:Record<string,ProviderAdapter>={
 deepseek:{id:'deepseek',url:'https://chat.deepseek.com/',inputHints:['message','ask deepseek','send a message'],loginHints:['log in','sign in'],...common},
 qwen:{id:'qwen',url:'https://chat.qwen.ai/',inputHints:['message qwen','ask qwen','send a message'],loginHints:['log in','sign in'],...common},
 gemini:{id:'gemini',url:'https://gemini.google.com/app',inputHints:['enter a prompt','ask gemini'],loginHints:['sign in'],...common},
 generic:{id:'generic',url:'',inputHints:['message','prompt','ask'],loginHints:['log in','sign in'],...common}
};
export function getProvider(id:string,url?:string){const p=providers[id];if(!p)throw new Error(`Unsupported provider: ${id}`);return {...p,url:url||p.url};}
