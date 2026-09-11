export const INITIAL_RATING=1000;
export const K_FACTOR=32;
export function expectedScore(rating:number,opponent:number){return 1/(1+10**((opponent-rating)/400));}
// Round one signed delta symmetrically; its inverse keeps a two-player update zero-sum.
export function elo(a:number,b:number,actual:0|0.5|1):[number,number]{const raw=K_FACTOR*(actual-expectedScore(a,b));const delta=Math.sign(raw)*Math.round(Math.abs(raw));return[a+delta,b-delta];}
