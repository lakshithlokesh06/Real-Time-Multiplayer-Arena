import { Router } from "express";
import { z } from "zod";
import type { Environment } from "../config/env.js";
import type { AuthService } from "../services/auth.js";
import type { MatchService } from "../services/matches.js";
import { identity, requireAuth } from "../middleware/auth.js";
import { HttpError } from "../utils/http-error.js";
export function matchesRouter(config:Environment,auth:AuthService,matches:MatchService){
 const router=Router();router.use(requireAuth(auth,config));
 router.get("/",async(req,res)=>{const query=z.strictObject({limit:z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(25)).optional()}).safeParse(req.query);if(!query.success)throw new HttpError(400,"Limit must be 1–25.");res.json({matches:await matches.list(identity(res).player.profile.id,query.data.limit)});});
 router.get("/:matchId",async(req,res)=>{const id=z.string().uuid().safeParse(req.params.matchId);if(!id.success)throw new HttpError(400,"Invalid match ID.");res.json({match:await matches.detail(identity(res).player.profile.id,id.data)});});
 return router;
}
