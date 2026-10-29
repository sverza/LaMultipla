import path from 'node:path';
export function privateChannelPaths(root,channel='synthetic_shadow'){
  if(!['synthetic_shadow','shadow'].includes(channel))throw new Error('Canale privato non valido');
  const base=path.join(root,'.local/private-delivery'),directory=channel==='synthetic_shadow'?base:path.join(base,'channels/shadow');
  return {base,directory,outbox:path.join(directory,'outbox'),writer:path.join(directory,'writer.dpapi.json'),
    session:path.join(base,'session.dpapi.json'),fcm:path.join(base,'fcm.dpapi.json'),
    orchestration:channel==='synthetic_shadow'?path.join(root,'.local/orchestrator'):path.join(root,'.local/orchestrator/channels/shadow')};
}
