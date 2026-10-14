import type {PrivatePairing} from './private-pairing.mjs';
export const TRANSITION_DOMAIN:string;
export type PairingTransition={schema:'lamultipla-private-pairing-transition-v1';statement:string;signature:string;profileJson:string};
type Cursor={sequence:number;deliveryHash:string|null};
export function createShadowTransition(options:{profile:PrivatePairing;nextProfile:PrivatePairing;cursor:Cursor;privateKey:CryptoKey;now?:Date|string}):Promise<PairingTransition>;
export function verifyShadowTransition(frame:unknown,options:{profile:PrivatePairing;cursor:Cursor;now?:Date|string}):Promise<{profile:PrivatePairing;statement:Record<string,unknown>}>;
