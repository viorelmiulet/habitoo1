/** Only predefined management links become interactive; never render arbitrary model HTML/URLs. */
export function AgencyAnswerContent({content}:{content:string}){
  const lines=content.split('\n');
  return <div className="space-y-1 whitespace-pre-wrap break-words">{lines.map((line,i)=>{
    const match=/^- \[([^\]]+)\]\((\/app\/(?:properties\/[0-9a-f-]{36}|leads\?lead=[0-9a-f-]{36}))\)$/.exec(line);
    const label=match?.[1],href=match?.[2];
    return label && href?<p key={i}><a href={href} className="underline">{label}</a></p>:<p key={i}>{line}</p>;
  })}</div>;
}