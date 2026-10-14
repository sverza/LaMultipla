import type {DeliveryFrame} from './private-delivery.mjs';
export type CloudConfig={projectId:string;readerUid:string;channel:'synthetic_shadow'|'shadow'};
export type CloudHead={sequence:number;deliveryId:string;deliveryHash:string;updateTime:string};
export function validateCloudConfig(value:unknown):CloudConfig;
export function roundKey(statement:{season:string;matchday:number}):string;
export function createPrivateCloud(config:CloudConfig,options:{getIdToken:()=>Promise<string>;fetchImpl?:typeof fetch}):{
head:()=>Promise<CloudHead|null>;
event:(sequence:number)=>Promise<({frame:DeliveryFrame;sequence:number;deliveryId:string;deliveryHash:string;body:string})|null>;
publish:(frame:DeliveryFrame)=>Promise<{accepted:boolean;duplicate:boolean}>;
acknowledge:(deviceId:string,sequence:number,hash:string)=>Promise<void>;
ack:(deviceId:string)=>Promise<{sequence:number;deliveryHash:string}|null>;
device:(deviceId:string)=>Promise<{fcmToken:string;applicationId:string}|null>;
registerDevice:(deviceId:string,fcmToken:string,applicationId:string,roundStateProtocol?:number)=>Promise<void>;
};
