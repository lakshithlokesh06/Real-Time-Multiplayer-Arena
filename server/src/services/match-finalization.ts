import { setTimeout as delay } from "node:timers/promises";
import { logger } from "../utils/logger.js";
/** Only lifecycle callers use this helper. Never called repeatedly by simulation ticks. */
export async function retryLifecycle(action:()=>Promise<unknown>, event:string, wait:(ms:number)=>Promise<unknown>=delay) {
 for(let attempt=0;attempt<3;attempt++){
  try {await action();return true;}
  catch {logger.warn(event,{attempt:attempt+1});if(attempt<2)await wait([250,1000][attempt]!);}
 }
 return false;
}
