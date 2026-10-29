import {importPrivateFrame,readPrivateCursor,readPrivateDeliveryFrame,syncPrivateInbox} from './private-receiver.mjs';
// Both durable archives must agree before ACK. Replay repairs an interrupted
// native mirror even when IndexedDB committed and no new events are available.
async function reconcile(native,scope,trust,now){
  const cursor=await readPrivateCursor(scope),before=await native.cursor();
  if(!Number.isSafeInteger(before.sequence)||before.sequence<0||before.sequence>1000000
    ||(before.sequence===0?before.deliveryHash!==null:!/^[a-f0-9]{64}$/.test(before.deliveryHash)))throw new Error('Cursore nativo non valido');
  if(before.sequence>cursor.sequence)return before.sequence-cursor.sequence;
  if(before.sequence){const archived=await readPrivateDeliveryFrame(scope,before.sequence,trust,{now});
    if(archived.deliveryHash!==before.deliveryHash)throw new Error('Archivio nativo in conflitto');}
  const end=Math.min(cursor.sequence,before.sequence+16);
  for(let n=before.sequence+1;n<=end;n++){
    const verified=await readPrivateDeliveryFrame(scope,n,trust,{now});
    await native.archiveImported({json:JSON.stringify(verified.frame)});
  }
  const after=await native.cursor();
  if(after.sequence>end)return Math.max(1,Math.abs(after.sequence-cursor.sequence));
  const expected=end?await readPrivateDeliveryFrame(scope,end,trust,{now}):null;
  if(after.sequence!==end||after.deliveryHash!==(expected?.deliveryHash??null))throw new Error('Archivio nativo non confermato');
  return cursor.sequence-end;
}
export async function receiveAndroidPrivate({native,cloud,trust,scope,deviceId,onImported=()=>{},now=new Date()}){
  const {frames}=await native.inbox();let received=0;
  for(const frame of frames){
    const result=await importPrivateFrame(frame,trust,{scope,now});
    if(!result.reused){received++;await onImported(result);}
  }
  const pending=await reconcile(native,scope,trust,now);
  let cursor=await readPrivateCursor(scope);
  if(pending)return {received,pending,acknowledged:0,sequence:cursor.sequence};
  if(frames.length&&cursor.sequence){
    await cloud.acknowledge(deviceId,cursor.sequence,cursor.deliveryHash);
    await native.consume({sequence:cursor.sequence,deliveryHash:cursor.deliveryHash});
  }
  const result=await syncPrivateInbox({cloud,trust,scope,deviceId,now,onImported:async value=>{
    await native.archiveImported({json:JSON.stringify(value.frame)});await onImported(value);
  }});
  cursor=await readPrivateCursor(scope);
  return {...result,received:received+result.received,sequence:cursor.sequence};
}
