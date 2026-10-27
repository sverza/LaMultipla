// TEST-ONLY scheduling barriers. Every read/link/unlink uses the real filesystem.
// No lock contents, clocks, return values or production code are substituted.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function forceMutualWithdrawal(directory,work){
 const locks=path.resolve(directory,'locks'),original={link:fs.link,unlink:fs.unlink},actors=new Map(),trace=[],gates=[];
 const note=(event,actor,details={})=>trace.push({sequence:trace.length+1,event,actor,...details});
 function gate(name){let release;const promise=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('TEST_SCHEDULE_BOUND_EXCEEDED:'+name)),5000);
  release=()=>{clearTimeout(timer);resolve();};});const g={promise,release};gates.push(g);return g;}
 const announcedB=gate('B_announcement'),ticketGoneA=gate('A_withdrawal'),ticketGoneB=gate('B_withdrawal');
 function identify(file){if(path.dirname(path.resolve(file))!==locks)return null;const base=path.basename(file),match=base.match(/^(\d+-[a-f0-9-]{36})(\.ticket)?\.json$/);return match?{base:match[1],ticket:Boolean(match[2])}:null;}
 fs.link=async(from,to)=>{
  const id=identify(to);if(!id)return original.link(from,to);
  let actor=actors.get(id.base);
  if(id.ticket){if(actor==='A')await announcedB.promise;else if(actor==='B')await ticketGoneA.promise;}
  const value=await original.link(from,to);
  if(!id.ticket){actor=actors.size?'B':'A';actors.set(id.base,actor);note('announcement_published',actor);if(actor==='B')announcedB.release();}
  else{
   note('ticket_published',actor);
   const other=[...actors].find(([,name])=>name!==actor);
   if(other){const owner=JSON.parse(await fs.readFile(path.join(locks,other[0]+'.json'),'utf8'));
    const ticketExists=await fs.stat(path.join(locks,other[0]+'.ticket.json')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
    note('other_owner_observed',actor,{otherActor:other[1],choosing:owner.choosing,ticket:owner.ticket,ticketExists});}
  }
  return value;
 };
 fs.unlink=async file=>{
  const id=identify(file);if(!id)return original.unlink(file);const actor=actors.get(id.base);
  if(actor==='A'&&!id.ticket){note('announcement_release_waits_for_B',actor);await ticketGoneB.promise;}
  const value=await original.unlink(file);note(id.ticket?'ticket_withdrawn':'announcement_withdrawn',actor);
  if(id.ticket&&actor==='A')ticketGoneA.release();if(id.ticket&&actor==='B')ticketGoneB.release();return value;
 };
 try{return {results:await Promise.allSettled([work(),work()]),trace};}
 finally{fs.link=original.link;fs.unlink=original.unlink;for(const g of gates)g.release();}
}
