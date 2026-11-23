/** Bucharest calendar date shared by the daily cache and activities. */
export function briefDate(now: Date): string {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export type SentenceDeps={featureEnabled:()=>Promise<boolean>;creditsBlocked:()=>Promise<string|null>;generate:()=>Promise<string>};
export async function maybeAiSentence(deps:SentenceDeps):Promise<string|null>{try{if(!await deps.featureEnabled() || await deps.creditsBlocked())return null;const text=(await deps.generate()).trim().replace(/\s+/g,' ');return text?text.slice(0,300):null;}catch{return null;}}
