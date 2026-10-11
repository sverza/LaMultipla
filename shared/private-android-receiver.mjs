import {importPrivateFrame,readPrivateCursor,syncPrivateInbox} from './private-receiver.mjs';
// Android inbox is encrypted and durable. The JS semantic validator/transaction
// must complete before ACK and before deleting a native inbox entry.
export async function receiveAndroidPrivate({native,cloud,trust,scope,deviceId,onImported=()=>{},now=new Date()}){
  const {frames}=await native.inbox();let received=0;
  for(const frame of frames){
    const result=await importPrivateFrame(frame,trust,{scope,now});
    await native.archiveImported({json:JSON.stringify(frame)});
    if(!result.reused){received++;await onImported(result);}
  }
  let cursor=await readPrivateCursor(scope);
  if(frames.length&&cursor.sequence){
    await cloud.acknowledge(deviceId,cursor.sequence,cursor.deliveryHash);
    // The native cursor can be behind the JS cursor after foreground catch-up.
    const last=frames.at(-1),s=JSON.parse(last.statement);
    const {textSha256}=await import('./private-delivery.mjs');
    await native.consume({sequence:s.sequence,deliveryHash:await textSha256(last.statement)});
  }
  const result=await syncPrivateInbox({cloud,trust,scope,deviceId,now,onImported:async value=>{
    await native.archiveImported({json:JSON.stringify(value.frame)});await onImported(value);
  }});
  cursor=await readPrivateCursor(scope);
  return {...result,received:received+result.received,sequence:cursor.sequence};
}
