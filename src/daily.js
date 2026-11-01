export function validDailyDate(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'0001-01-01') return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}
export function todayDate(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function shiftDailyDate(value, amount) {
  if(!validDailyDate(value)) return null;
  const date=new Date(value+'T00:00:00Z'); date.setUTCDate(date.getUTCDate()+amount);
  const result=date.toISOString().slice(0,10);
  return validDailyDate(result)?result:null;
}
