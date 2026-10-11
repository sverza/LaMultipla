import type {DeliveryTrust} from './private-delivery.mjs';
export type PrivatePairing={schema:'lamultipla-private-pairing-v1';projectId:string;apiKey:string;mobileAppId:string;senderId:string;deviceId:string;trust:DeliveryTrust};
export function validatePrivatePairing(value:unknown,applicationId:string,fingerprint:string):Promise<PrivatePairing>;
