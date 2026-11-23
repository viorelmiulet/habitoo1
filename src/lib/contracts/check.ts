export type ContractCheckIssue={field:string;source:string;kind:'missing'|'mismatch'|'unavailable';message:string};
export type CheckValue={field:string;label:string;contract:string|number|null;reference:string|number|null;source:string;required?:boolean};
const norm=(v:string|number|null)=>String(v??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[\s,.;]+/g,' ').trim();
export function compareContractValues(values:CheckValue[]):ContractCheckIssue[]{
  return values.flatMap<ContractCheckIssue>(v=>{
    if(v.contract===null || norm(v.contract)==='')return v.required===false?[]:[{field:v.field,source:v.source,kind:'missing' as const,message:`${v.label}: câmp gol în contract.`}];
    if(v.reference===null || norm(v.reference)==='')return [{field:v.field,source:v.source,kind:'unavailable' as const,message:`${v.label}: sursa de comparație nu este disponibilă.`}];
    if(norm(v.contract)!==norm(v.reference))return [{field:v.field,source:v.source,kind:'mismatch' as const,message:`${v.label}: nu corespunde cu ${v.source}.`}];
    return [];
  });
}
/** Checks rendered body against known contract values; sensitive values never appear in issues. */
export function checkContractBody(body:string,values:{field:string;label:string;value:string|number|null}[]):ContractCheckIssue[]{
  const normalized=norm(body);
  return values.flatMap(v=>{
    if(v.value===null || norm(v.value)==='')return [];
    const present=typeof v.value==='number'?new RegExp(`(^|[^0-9])${String(v.value).replace('.', '[.,]')}([^0-9]|$)`).test(body.replace(/(?<=\d)[.\s](?=\d{3}(?:\D|$))/g,'')):normalized.includes(norm(v.value));
    return present?[]:[{field:v.field,source:'textul contractului',kind:'mismatch' as const,message:`${v.label}: valoarea din datele contractului nu apare în textul documentului.`}];
  });
}