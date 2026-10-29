import type {MultimarketTrust,VerifiedMultimarket} from './multimarket-experiment.mjs';
export const MULTIMARKET_DATABASE:string;
export function importMultimarketTrust(input:unknown):Promise<MultimarketTrust>;
export function readMultimarketTrust():Promise<MultimarketTrust[]>;
export function importMultimarketFrame(input:unknown,options?:{now?:Date}):Promise<VerifiedMultimarket&{reused:boolean}>;
export function readMultimarketExperiments(options?:{now?:Date}):Promise<VerifiedMultimarket[]>;
export function exportMultimarketBackup(options?:{now?:Date}):Promise<unknown>;
export function validateMultimarketBackup(input:unknown,options?:{now?:Date}):Promise<unknown>;
export function restoreMultimarketBackup(input:unknown,options?:{now?:Date}):Promise<{restored:number}>;
