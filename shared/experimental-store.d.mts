import type {ExperimentalEnvelope} from './decision-v4.mjs';
export const EXPERIMENT_DATABASE:string;
export const EXPERIMENT_DATABASE_VERSION:number;
export function upgradeExperimentDatabase(database:IDBDatabase):void;
export function readExperiments():Promise<ExperimentalEnvelope[]>;
export function mergeExperiments(input:unknown[]):Promise<ExperimentalEnvelope[]>;
export function addExperiment(input:unknown):Promise<ExperimentalEnvelope>;
export function parseBackup(input:unknown):Promise<{slips:Record<string,unknown>[];preferences:Record<string,unknown>;experiments:ExperimentalEnvelope[]}>;
export function makeBackup(input:{slips:unknown[];preferences:Record<string,unknown>;experiments:ExperimentalEnvelope[];exportedAt:string}):Promise<Record<string,unknown>>;
