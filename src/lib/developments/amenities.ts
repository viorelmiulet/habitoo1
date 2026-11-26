/** Facilitățile ansamblului, pe grupurile formularului Storia (investiții). Valorile salvate rămân etichete text. */
export type StoriaAmenityGroup='project-amenities'|'project-security'|'extra-spaces';
export type DevelopmentAmenityOption={label:string;storia?:{group:StoriaAmenityGroup;value:string};aliases?:readonly string[]};
const o=(label:string,group:StoriaAmenityGroup,value:string,aliases:readonly string[]=[]):DevelopmentAmenityOption=>({label,storia:{group,value},aliases});
export const developmentAmenityGroups:readonly {id:StoriaAmenityGroup|'other';title:string;options:readonly DevelopmentAmenityOption[]}[]=[
 {id:'project-amenities',title:'Dotări',options:[o('Loc de joacă','project-amenities','playground'),o('Sală de fitness','project-amenities','gym',['Sală fitness']),o('Lift','project-amenities','elevators'),o('Zonă de relaxare','project-amenities','relax-area',['Spații agrement']),o('Teren de sport','project-amenities','sport-fields'),o('Accesibil persoanelor cu dizabilități','project-amenities','disabled-friendly'),o('Piscină','project-amenities','swimming-pool',['Piscină interioară','Piscină exterioară'])]},
 {id:'project-security',title:'Securitate',options:[o('Serviciu de monitorizare / protecție','project-security','monitoring',['Supraveghere video']),o('Detectoare de fum','project-security','smoke-detector'),o('Curte împrejmuită','project-security','closed-area'),o('Sistem de alarmă','project-security','alarm-system'),o('Protecție / pază','project-security','security-vigilance',['Pază'])]},
 {id:'extra-spaces',title:'Spațiu suplimentar',options:[o('Balcon','extra-spaces','balcony'),o('Terasă','extra-spaces','terrace'),o('Subsol','extra-spaces','basement'),o('Loc de parcare suprateran','extra-spaces','ground-parking-space'),o('Loc de parcare subteran','extra-spaces','underground-parking-space',['Parcare subterană']),o('Cameră pentru biciclete','extra-spaces','bicycle-room'),o('Debara','extra-spaces','storage')]},
 {id:'other',title:'Alte facilități',options:['Interfon','Videointerfon','Sauna','SPA','Acoperiș','Curte','Curte comună','Grădină','Uscătorie'].map(label=>({label}))},
];
const names=(opt:DevelopmentAmenityOption)=>[opt.label,...(opt.aliases??[])];
/** Bifat dacă e salvată eticheta sau o etichetă veche echivalentă. */
export function isAmenityChecked(saved:readonly string[],opt:DevelopmentAmenityOption){return names(opt).some(n=>saved.includes(n));}
/** Bifare: adaugă eticheta nouă; debifare: scoate eticheta și echivalentele vechi. Celelalte valori salvate rămân neatinse. */
export function toggleAmenity(saved:readonly string[],opt:DevelopmentAmenityOption,checked:boolean):string[]{
 if(checked)return isAmenityChecked(saved,opt)?[...saved]:[...saved,opt.label];
 const drop=new Set(names(opt));return saved.filter(s=>!drop.has(s));
}
/** Atributele Storia multiple, fiecare valoare o singură dată, în ordinea grupurilor. */
export function storiaAmenityAttributes(saved:readonly string[]):{urn:string;value:string}[]{
 const out:{urn:string;value:string}[]=[];
 for(const g of developmentAmenityGroups)for(const opt of g.options)if(opt.storia&&isAmenityChecked(saved,opt)){const a={urn:`urn:concept:${opt.storia.group}`,value:`urn:concept:${opt.storia.value}`};if(!out.some(x=>x.urn===a.urn&&x.value===a.value))out.push(a);}
 return out;
}
export const NUMBER_OF_ROOMS_OPTIONS=['1','2','3','4','5','6','7','8','9','10','more'] as const;
export function ceilingHeightError(from:number|null,to:number|null):string|null{
 for(const v of [from,to])if(v!=null&&(!Number.isInteger(v)||v<=0))return 'Înălțimea tavanului trebuie să fie un număr întreg pozitiv (cm).';
 if(from!=null&&to!=null&&from>to)return 'Înălțimea tavanului „de la” trebuie să fie cel mult egală cu „până la”.';
 return null;
}
export const developmentReferenceId=(id:string)=>`ANS-${id.slice(0,8).toUpperCase()}`;
/** „Plan”: cel mult o fotografie (impus în baza de date); coperta nu poate fi marcată. */
export const canMarkFloorPlan=(photo:{is_primary:boolean})=>!photo.is_primary;
