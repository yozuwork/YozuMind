// Validate without serializing parsed values: preserve key order and exact numeric tokens.
export function formatJsonNote(text,maxLength=10000){
  const trimmed=String(text||'').trim(),fence=/^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  const source=(fence?fence[1]:trimmed).trim();
  if(!source)throw new Error('筆記沒有 JSON 內容。');
  try{JSON.parse(source);}catch(error){throw new Error('JSON 格式錯誤，原文已保留：'+error.message);}
  if(!/^[{[]/.test(source))throw new Error('請提供 JSON 物件或陣列，例如 {"name":"範例"}。');
  const tokens=source.match(/"(?:[^"\\]|\\[\s\S])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g);
  let result='',depth=0;
  const newline=()=>{result+='\n'+'  '.repeat(depth);};
  tokens.forEach((token,i)=>{
    if(token==='{'||token==='['){result+=token;depth++;if(tokens[i+1]!=='}'&&tokens[i+1]!==']')newline();}
    else if(token==='}'||token===']'){depth--;if(tokens[i-1]!=='{'&&tokens[i-1]!=='[')newline();result+=token;}
    else if(token===','){result+=token;newline();}
    else if(token===':')result+=': ';
    else result+=token;
  });
  const note='```json\n'+result+'\n```';
  if(note.length>maxLength)throw new Error(`格式化後超過 ${maxLength.toLocaleString()} 字上限，請拆分內容；原文已保留。`);
  return note;
}
