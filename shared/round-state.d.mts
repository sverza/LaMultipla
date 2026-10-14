export const ROUND_STATE_SCHEMA:'lamultipla-app-round-state-v1';
export type RoundState={schema:'lamultipla-app-round-state-v1';id:string;round:{season:string;matchday:number};generatedAtUtc:string;
 status:'no_bet';phase:string;mode:'experimental';delivery:'private_local';sourceData:string;final:boolean;actualStakeEUR:0;nominalStakeEUR:0;
 operational:{decision:'NO_BET';cause:'MODEL_NOT_AUTHORIZED';authorized:false;publicationAllowed:false};protocolVersion:string;calendarSha256:string;attemptHashes:string[];reasonCodes:string[];nextWindowAtUtc:string|null};
export function validateRoundState(value:unknown):RoundState;
export const ROUND_PHASES:readonly string[];
export const roundPhaseLabels:Record<string,string>;
