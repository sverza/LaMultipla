import type {DeliveryFrame,DeliveryTrust,VerifiedDelivery} from './private-delivery.mjs';
import type {createPrivateCloud} from './private-cloud.mjs';
export type PrivateInboxBridge={cursor:()=>Promise<{sequence:number;deliveryHash:string|null}>;inbox:()=>Promise<{frames:DeliveryFrame[]}>;archiveImported:(value:{json:string})=>Promise<void>;consume:(value:{sequence:number;deliveryHash:string})=>Promise<void>};
export function receiveAndroidPrivate(options:{native:PrivateInboxBridge;cloud:ReturnType<typeof createPrivateCloud>;trust:DeliveryTrust;scope:string;deviceId:string;now?:Date|string;onImported?:(value:VerifiedDelivery&{reused:boolean})=>void|Promise<void>}):Promise<{received:number;pending:number;acknowledged:number;sequence:number}>;
