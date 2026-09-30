// Geographic Europe, including European programme records (EU); not EU membership.
export const EUROPE = new Set('AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO SM RS SK SI ES SE CH TR UA GB VA EU'.split(' '));
export function inScope(entity,scope){
 if(scope==='nl')return entity.country==='NL';
 if(scope==='zh')return entity.country==='NL'&&entity.province==='Zuid-Holland';
 if(scope==='ca')return entity.country==='CA';
 if(scope==='eu')return !entity.country||EUROPE.has(entity.country);
 return true;
}
export function scopeFor(entity){return entity?.country==='CA'?'ca':entity?.country==='NL'?'nl':!entity?.country||EUROPE.has(entity.country)?'eu':'all';}
