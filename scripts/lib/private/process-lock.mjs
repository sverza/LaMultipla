import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
export async function privateLock(directory,action){
  // Lamport bakery participants have unique names, never reused. Removing a
  // dead participant cannot unlink a new owner's lock during crash recovery.
  // Local filesystem on one host only; process IDs cannot arbitrate a share.
  const locks=path.join(directory,'locks');await fs.mkdir(locks,{recursive:true,mode:0o700});
  const nonce=randomUUID(),name=`${process.pid}-${nonce}.json`,filename=path.join(locks,name);
  const owner={pid:process.pid,host:os.hostname(),nonce,choosing:true,ticket:0};
  async function participants(){const result=[];
    for(const entry of await fs.readdir(locks)){
      const temporary=entry.endsWith('.json.tmp');
      const match=entry.match(/^(\d+)-([a-f0-9-]{36})\.json(?:\.tmp)?$/);if(!match)throw new Error('Lock privato sconosciuto');
      if(temporary){try{process.kill(Number(match[1]),0);}catch(e){if(e.code!=='ESRCH')throw e;await fs.unlink(path.join(locks,entry)).catch(e=>{if(e.code!=='ENOENT')throw e;});}continue;}
      const pid=Number(match[1]);if(!Number.isSafeInteger(pid)||pid<1)throw new Error('PID non valido');
      const file=path.join(locks,entry);let record;
      try{record=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')continue;record={pid,host:os.hostname(),nonce:match[2],choosing:true,ticket:0};}
      if(record.pid!==pid||record.nonce!==match[2]||record.host!==os.hostname())throw new Error('Lock di altro host o alterato');
      try{process.kill(pid,0);}catch(e){if(e.code!=='ESRCH')throw new Error('Impossibile verificare il proprietario del lock');
        await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});continue;}
      if(typeof record.choosing!=='boolean'||!Number.isSafeInteger(record.ticket)||record.ticket<0)throw new Error('Lock incompleto');
      result.push({name:entry,...record});
    }return result;
  }
  let handle=await fs.open(filename,'wx',0o600);
  try{
    await handle.writeFile(JSON.stringify(owner));await handle.sync();await handle.close();handle=null;
    owner.ticket=1+Math.max(0,...(await participants()).map(p=>p.ticket));
    if(!Number.isSafeInteger(owner.ticket))throw new Error('Ticket lock esaurito');owner.choosing=false;
    const temporary=filename+'.tmp';await fs.writeFile(temporary,JSON.stringify(owner),{flag:'wx',mode:0o600});
    await fs.rename(temporary,filename);
    const others=(await participants()).filter(p=>p.name!==name);
    if(others.some(p=>p.choosing||p.ticket<owner.ticket||p.ticket===owner.ticket&&p.name<name))throw new Error('Produttore privato già in esecuzione');
    return await action();
  }finally{
    if(handle)await handle.close();await fs.unlink(filename).catch(e=>{if(e.code!=='ENOENT')throw e;});
    await fs.unlink(filename+'.tmp').catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
}
