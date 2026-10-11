import type {DeliveryFrame,DeliveryTrust,VerifiedDelivery} from './private-delivery.mjs';
import type {CloudConfig} from './private-cloud.mjs';
export function receiverScope(config:CloudConfig,trust:DeliveryTrust):Promise<string>;
export function readPrivateCursor(scope:string):Promise<{id:string;sequence:number;deliveryHash:string|null}>;
export type PrivateDeliveryInfo={sequence:number;keyId:string;expiresAtUtc:string;expiredAtReception:boolean};
export function readPrivateDeliveryInfo(scope:string,trust:DeliveryTrust,options?:{now?:Date|string}):Promise<Record<string,PrivateDeliveryInfo>>;
export function importPrivateFrame(frame:DeliveryFrame,trust:DeliveryTrust,options:{scope:string;now?:Date|string}):Promise<VerifiedDelivery&{reused:boolean}>;
export function syncPrivateInbox(options:{cloud:{head:()=>Promise<{sequence:number;deliveryHash:string}|null>;event:(n:number)=>Promise<{frame:DeliveryFrame}|null>;acknowledge:(device:string,n:number,hash:string)=>Promise<void>};trust:DeliveryTrust;scope:string;deviceId:string;now?:Date|string;limit?:number;onImported?:(value:VerifiedDelivery&{reused:boolean})=>void|Promise<void>}):Promise<{received:number;pending:number;acknowledged:number}>;
