import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import type {Environment} from '../config/env.js';
import type {AuthService} from '../services/auth.js';
import type {MatchService} from '../services/matches.js';
import {identity,requireAuth} from '../middleware/auth.js';
import {HttpError} from '../utils/http-error.js';
export function competitiveRouter(config:Environment,auth:AuthService,matches:MatchService){
 const router=Router();
 const guard=[requireAuth(auth,config),rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many ranking requests. Try again shortly.'}})];
 const integer=(max:number)=>z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
 router.get('/leaderboard',...guard,async(req,res)=>{
  const query=z.strictObject({page:integer(100000).default(1),limit:integer(50).default(25)}).safeParse(req.query);
  if(!query.success)throw new HttpError(400,'Page must be 1–100000 and limit 1–50.');
  res.json(await matches.statistics.leaderboard(identity(res).player.profile.id,query.data.page,query.data.limit));
 });
 router.get('/statistics/me',...guard,async(req,res)=>{
  if(Object.keys(req.query).length)throw new HttpError(400,'Unexpected query parameters.');
  res.json(await matches.statistics.summary(identity(res).player.profile.id));
 });
 return router;
}
