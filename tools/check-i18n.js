#!/usr/bin/env node
/* SPAN3 language check. Run: node tools/check-i18n.js [folder with exported .gs files]
   Exit code 1 means do not commit. Checks index.html:
   1  every table row has English and Spanish (no blank, no missing)
   2  {0} {1} placeholders match between English and Spanish
   3  the 4 transfers and 4 high seasons are in the table
   4  Spanish follows the house rules (Mexican Spanish, no tax wording, no Sophie)
   5  no guest English is left in the code outside the table
   6  with a backend folder: every backend sentence has a Spanish row, and the
      table's English transfers and season names still match the backend */
const fs=require('fs'),path=require('path');
const file=path.join(__dirname,'..','index.html');
const src=fs.readFileSync(file,'utf8');
const fail=[];const bad=m=>fail.push(m);
const grab=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('table not found: '+a);return src.slice(i,j)};
const T=new Function(grab('var T={','/* English sentences the backend')+';return T')();
const BE=new Function(grab('var BE=[','var L=ES_UI')+';return BE')();
let rows=0;
for(const k of Object.keys(T)){
  const r=T[k];
  if(!Array.isArray(r)||r.length!==2){bad('row shape: '+k);continue}
  if(Array.isArray(r[0])){
    rows+=r[0].length;
    if(r[0].length!==r[1].length)bad('list length: '+k);
    r[1].forEach((v,i)=>{if(!String(v||'').trim())bad('blank Spanish: '+k+'['+i+']')});
    continue;
  }
  rows++;
  if(!String(r[0]||'').trim())bad('blank English: '+k);
  if(!String(r[1]||'').trim())bad('MISSING SPANISH: '+k);
  const ph=s=>(String(s).match(/\{\d\}/g)||[]).sort().join();
  if(ph(r[0])!==ph(r[1]))bad('placeholders differ: '+k);
}
for(const id of ['sedan_zlo','suburban_zlo','sedan_pvr','suburban_pvr'])for(const f of ['nm','ds'])if(!T['tr_'+id+'_'+f])bad('transfer missing: '+id+' '+f);
for(const k of ['hs_ondalinda','hs_xmas','hs_cny','hs_easter'])if(!T[k])bad('high season missing: '+k);
BE.forEach((r,i)=>{if(!(r[0] instanceof RegExp)||!String(r[1]||'').trim())bad('MISSING SPANISH: backend row '+i)});
const es=[...Object.values(T).map(r=>Array.isArray(r[1])?r[1].join(' '):r[1]),...BE.map(r=>r[1])].join('\n');
const rules=[[/\bm[oó]vil\b/i,'móvil'],[/\breservas?\b/i,'reserva (use reservación)'],[/\bvosotros\b|\bvuestr/i,'vosotros'],[/\b(tu|tus|t[uú]|elige|puedes|tienes)\b/i,'tú form (use usted)'],[/\bordenador\b|\bcoche\b/i,'Spain word'],[/\bimpuesto|\bIVA\b|\btax\b/i,'tax wording'],[/sophie/i,'Sophie']];
for(const [re,n] of rules)if(re.test(es))bad('house rule: '+n+' :: '+es.match(re)[0]);
if(/sophie/i.test(src))bad('Sophie named in the widget');
/* 5: code with the table lifted out must hold no guest sentence */
const code=src.replace(grab('var T={','var L=ES_UI'),'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
const script=code.slice(code.indexOf('<script>'),code.lastIndexOf('</script>'));
const allowed=/^(WhatsApp|Casa Papelillo|USD|GET|POST|Content-Type|text\/plain|Config request failed|Invalid config response|Safety check failed.*|Invalid M.*|Checkout call failed.*|Availability call failed.*)$/;
const lit=[];for(const m of script.matchAll(/>\s*([A-Z][a-z]{2,}[^<>'"+]*)</g))lit.push(m[1].trim());
for(const m of script.matchAll(/"([A-Z][a-z]+ [a-z][^"]{3,})"/g))lit.push(m[1]);
for(const s of lit)if(!allowed.test(s))bad('English outside the table: '+s);
for(const m of script.matchAll(/\bt\("([a-z_]+)"[,)]/g))if(!T[m[1]])bad('table row not found: '+m[1]);
if(!/<html lang="en">/.test(src))bad('static html lang changed');
if(!/documentElement\.lang="es-MX"/.test(src))bad('es-MX page language missing');
/* 6: backend */
const dir=process.argv[2];
if(dir){
  const gs=f=>fs.readFileSync(path.join(dir,f),'utf8');
  const msgs=[];
  for(const f of ['Web.gs','Checkout.gs']){
    const s=gs(f).replace(/" \+\s*\n\s*"/g,'');
    for(const m of s.matchAll(/message:\s*"([^"]+)"/g))msgs.push(m[1]);
  }
  const c=gs('Checkout.gs');
  msgs.push(c.match(/RECAPTCHA_SOFT_FAIL_MESSAGE =\s*"([^"]+)" \+\s*"([^"]+)"/).slice(1).join(''));
  msgs.push('Up to 2 pets can be included in a booking.','Up to 1 pet can be included in a booking.','We are not able to accept pets for this stay.','Bookings require at least 1 day advance notice.','Bookings can only be made up to 365 days in advance.','Minimum stay is 5 nights during high season.','Minimum stay is 2 nights during mid season.','Minimum stay is 2 nights during low season.','Unknown transportation option: x','Invalid transportation quantity for x');
  const internal=/^Use \?action|^Stripe returned|^Invalid stored/;
  for(const m of new Set(msgs)){if(internal.test(m)||/^(Up to|Minimum stay is|Bookings)/.test(m)&&/" \+|^Bookings require at least $|^Minimum stay is $/.test(m))continue;if(!BE.some(r=>r[0].test(m))&&!/^(Unknown transportation option: |Invalid transportation quantity for |Minimum stay is |Bookings require at least |Bookings can only be made up to )$/.test(m))bad('backend sentence with no Spanish: '+m)}
  const cfg=gs('Config.gs');
  for(const m of cfg.matchAll(/id: "(\w+)",\s*name: "([^"]+)",\s*desc: "([^"]+)"/g)){
    const n=T['tr_'+m[1]+'_nm'],d=T['tr_'+m[1]+'_ds'];
    if(!n||n[0]!==m[2])bad('transfer name drifted: '+m[1]);
    if(!d||d[0]!==m[3])bad('transfer text drifted: '+m[1]);
  }
  const hl={CHINESE_NY:'hs_cny',EASTER:'hs_easter',ONDALINDA:'hs_ondalinda',XMAS_NYE:'hs_xmas'};
  for(const k in hl){const m=cfg.match(new RegExp(k+': "([^"]+)"'));if(!m||T[hl[k]][0]!==m[1])bad('season label drifted: '+k)}
}
if(fail.length){console.error('FAIL '+fail.length+'\n'+fail.join('\n'));process.exit(1)}
console.log('PASS: '+rows+' lines + '+BE.length+' backend sentences'+(dir?', backend matched':''));
