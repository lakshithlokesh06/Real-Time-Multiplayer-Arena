// Phase 8 browser QA. Run against production servers with MATCH_DURATION_SECONDS=15.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const artifacts = await mkdtemp(join(tmpdir(), 'arena-browser-'));
import pg from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
dotenv.config({path:'server/.env',quiet:true});
const suffix=randomUUID().slice(0,8);const emails=[`lobby_a_${suffix}@example.com`,`lobby_b_${suffix}@example.com`];
const browser=await chromium.launch({headless:true,...(process.env.ARENA_BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.ARENA_BROWSER_EXECUTABLE_PATH} : {})});
const errors=[];const consoleErrors=[];const latest=[null,null];const history=[[],[]];
try{
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);const pages=await Promise.all(contexts.map(c=>c.newPage()));const [a,b]=pages;
 for(let i=0;i<2;i++){
  const p=pages[i];
  p.on('websocket',ws=>ws.on('framereceived',event=>{const message=String(event.payload);if(message.startsWith('42')){try{const [type,snapshot]=JSON.parse(message.slice(2));if(type==='game:state'){latest[i]=snapshot;history[i].push(snapshot);}}catch{}}}));p.on('response',r=>{if(r.status()===404)console.log('404 resource:',new URL(r.url()).pathname);});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('401'))consoleErrors.push(m.text());});
  await p.goto('http://localhost:3000/register');await p.getByLabel('Email',{exact:true}).fill(emails[i]);await p.getByLabel('Username',{exact:true}).fill(`qa_${i}_${suffix}`);await p.getByLabel('Display name',{exact:true}).fill(i===0?'Lobby Alpha':'Lobby Bravo');await p.getByLabel('Password',{exact:true}).fill('A unique lobby test passphrase 85');await p.getByLabel('Confirm password',{exact:true}).fill('A unique lobby test passphrase 85');await p.getByRole('button',{name:'Create account',exact:true}).click();await p.waitForURL('http://localhost:3000/dashboard');await p.getByText('1000',{exact:false}).first().waitFor();const initial=await (await p.request.get('http://localhost:4000/api/statistics/me')).json();assert.equal(initial.mmr,1000);assert.equal(initial.division.name,'Silver');assert.equal(initial.rank,null);assert.equal(initial.totalMatches,0);await p.getByRole('link',{name:'Play',exact:true}).click();await p.getByRole('status').filter({hasText:/^Connected$/}).waitFor({timeout:10000}).catch(async error=>{console.log('BROWSER STATE',await p.locator('body').innerText(),errors,consoleErrors);await p.screenshot({path:join(artifacts, 'failure.png'),fullPage:true});throw error;});
 }
 async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Condition timeout');}
 // Aim along the authoritative target direction, using the bounded camera transform.
 async function aim(viewer,target){
  const p=pages[viewer];await p.bringToFront();await p.waitForTimeout(1000);
  const box=await p.locator('canvas').boundingBox();const self=at(viewer,viewer),other=at(viewer,target);
  const zoom=Math.min(1,box.width/700,box.height/420),vw=box.width/zoom,vh=box.height/zoom;
  const sx=Math.max(0,Math.min(1600-vw,self.x-vw/2)),sy=Math.max(0,Math.min(900-vh,self.y-vh/2));
  const length=Math.hypot(other.x-self.x,other.y-self.y);
  await p.mouse.move(box.x+(self.x-sx+(other.x-self.x)/length*90)*zoom,box.y+(self.y-sy+(other.y-self.y)/length*90)*zoom);
 }

 await a.getByRole('button',{name:'Find Match',exact:true}).click();await a.getByRole('button',{name:'Cancel Search',exact:true}).waitFor();
 await a.waitForTimeout(1200);await a.reload();await a.getByRole('button',{name:'Cancel Search',exact:true}).waitFor();assert.ok(!await a.getByRole('status').filter({hasText:'Searching · 0s elapsed'}).count());
 await a.getByRole('button',{name:'Cancel Search',exact:true}).click();await a.getByRole('button',{name:'Find Match',exact:true}).waitFor();
 await a.getByRole('button',{name:'Find Match',exact:true}).click();await b.getByRole('button',{name:'Find Match',exact:true}).click();
 for(const p of pages)await p.getByRole('heading',{name:'Match Found',exact:true}).waitFor();
 await a.getByRole('button',{name:'Accept',exact:true}).click();await a.getByRole('heading',{name:'Waiting for opponent…',exact:true}).waitFor();
 await b.getByRole('button',{name:'Decline',exact:true}).click();await a.getByRole('button',{name:'Cancel Search',exact:true}).waitFor();await b.getByRole('button',{name:'Find Match',exact:true}).waitFor();
 await b.getByRole('button',{name:'Find Match',exact:true}).click();
 for(const p of pages)await p.getByRole('heading',{name:'Match Found',exact:true}).waitFor({timeout:25000});
 await b.reload();await b.getByRole('heading',{name:'Match Found',exact:true}).waitFor();
 await b.setViewportSize({width:390,height:844});assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await b.screenshot({path:join(artifacts,'mobile-offer.png'),fullPage:true});await b.setViewportSize({width:1280,height:900});
 await a.getByRole('button',{name:'Accept',exact:true}).click();await a.getByRole('heading',{name:'Waiting for opponent…',exact:true}).waitFor();await b.getByRole('button',{name:'Accept',exact:true}).click();for(const p of pages)await p.getByRole('heading',{name:'Preparing Arena…',exact:true}).waitFor();for(const p of pages)await p.locator('canvas').waitFor();
 await until(()=>latest.every(s=>s?.players.length===2));
 const ids=latest[0].players.map(p=>p.playerProfileId);const at=(viewer,index)=>latest[viewer].players.find(p=>p.playerProfileId===ids[index]);
 assert.equal(latest[0].gameId,latest[1].gameId);const gameId=latest[0].gameId;
 assert.equal(at(0,0).health,100);assert.equal(at(1,1).health,100);
 assert.ok(latest[0].match.durationSeconds<=30,'Run server with MATCH_DURATION_SECONDS=15');
 await a.getByText(/^Time: /).waitFor();
 const initialX=at(0,0).x;await a.locator('.arena-canvas').focus();await a.keyboard.down('d');await a.waitForTimeout(150);await a.keyboard.up('d');await until(()=>at(0,0).x>initialX);
 await aim(0,1);await a.mouse.down();await until(()=>!at(1,1).alive);await a.mouse.up();
 assert.equal(at(0,0).score,1);assert.equal(at(1,1).deaths,1);
 await until(()=>latest.every(s=>s.match.status==='FINISHED'&&s.match.persistence==='SAVED'),35000);
 let result=latest[0].match.result;assert.deepEqual(result,latest[1].match.result);assert.equal(result.winnerPlayerProfileId,ids[0]);assert.equal(latest[0].match.remainingMs,0);assert.equal(latest[0].projectiles.length,0);
 for(const p of pages){await p.getByRole('heading',{name:'Match Complete',exact:true}).waitFor();assert.equal(await p.locator('canvas').count(),0);}
 await until(()=>latest.every(s=>s.match.persistence==='SAVED'));result=latest[0].match.result;assert.deepEqual(result.standings.map(p=>p.ratingDelta),[16,-16]);await a.getByText('MMR 1000 → 1016 (+16)',{exact:true}).waitFor();await b.getByText('MMR 1000 → 984 (-16)',{exact:true}).waitFor();
 const stats=async p=>{const response=await p.request.get('http://localhost:4000/api/statistics/me');assert.equal(response.status(),200);return response.json();};
 const firstA=await stats(a),firstB=await stats(b);assert.equal(firstA.wins,1);assert.equal(firstB.losses,1);assert.equal(firstA.eliminations,1);assert.equal(firstB.deaths,1);assert.equal(firstA.mmr,1016);assert.equal(firstB.mmr,984);assert.equal(firstA.currentWinStreak,1);assert.equal(firstA.peakMmr,1016);assert.deepEqual(firstA.recentForm.map(r=>r.outcome),['W']);assert.deepEqual(firstB.recentForm.map(r=>r.outcome),['L']);
 const board=await (await a.request.get('http://localhost:4000/api/leaderboard')).json();assert.equal(board.ownRank,firstA.rank);assert.ok(firstA.rank<firstB.rank);assert.ok(board.players.find(p=>p.playerProfileId===ids[0]));
 await a.screenshot({path:join(artifacts,'results.png'),fullPage:true});
 latest[1]=null;await b.reload();await b.getByRole('heading',{name:'Match Complete',exact:true}).waitFor();await until(()=>latest[1]?.match.status==='FINISHED');assert.deepEqual(latest[1].match.result,result);assert.equal(await b.locator('canvas').count(),0);
 await a.getByRole('button',{name:'Return to Lobby',exact:true}).click();await b.getByRole('button',{name:'Return to Lobby',exact:true}).click();
 for(const p of pages)await p.getByRole('button',{name:'Find Match',exact:true}).waitFor();
 await a.getByRole('button',{name:'Find Match',exact:true}).click();await b.getByRole('button',{name:'Find Match',exact:true}).click();for(const p of pages){await p.getByRole('button',{name:'Accept',exact:true}).waitFor();await p.getByRole('button',{name:'Accept',exact:true}).click();}for(const p of pages)await p.locator('canvas').waitFor();await until(()=>latest.every(s=>s.gameId!==gameId&&s.match.status==='IN_GAME'));assert.ok(latest[0].players.every(p=>p.health===100&&p.score===0));
 const rematchId=latest[0].gameId;
 await until(()=>latest.every(s=>s.match.status==='FINISHED'&&s.match.persistence==='SAVED'),35000);assert.equal(latest[0].match.result.tied,true);const secondA=await stats(a),secondB=await stats(b);assert.equal(secondA.ratedMatches,2);assert.equal(secondA.currentWinStreak,0);assert.equal(secondA.bestWinStreak,1);assert.equal(secondA.peakMmr,1016);assert.equal(secondA.mmr,1015);assert.deepEqual(secondA.recentForm.map(r=>r.outcome),['T','W']);assert.equal(secondB.ties,1);
 await b.setViewportSize({width:768,height:1024});await b.screenshot({path:join(artifacts,'tablet-results.png'),fullPage:true});assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await b.setViewportSize({width:390,height:844});await b.screenshot({path:join(artifacts,'mobile-results.png'),fullPage:true});assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await b.getByRole('link',{name:'Match history ↗',exact:true}).click();await b.waitForURL('http://localhost:3000/matches');await b.locator('.history-card').first().waitFor();assert.equal(await b.locator('.history-card').count(),2);await b.screenshot({path:join(artifacts,'mobile-history.png'),fullPage:true});assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const response=await b.request.get('http://localhost:4000/api/matches');assert.equal(response.status(),200);const body=await response.json();assert.equal(body.matches.length,2);assert.deepEqual(body.matches.find(m=>m.matchId===gameId),result);
 await a.getByRole('button',{name:'Return to Lobby',exact:true}).click();await a.getByRole('button',{name:'Find Match',exact:true}).waitFor();
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const rows=await pool.query('SELECT id,status FROM "Match" WHERE id = ANY($1::uuid[])',[[gameId,rematchId]]);assert.equal(rows.rowCount,2);assert.ok(rows.rows.every(r=>r.status==='FINISHED'));assert.equal((await pool.query('SELECT id FROM "MatchParticipant" WHERE "matchId" = ANY($1::uuid[])',[[gameId,rematchId]])).rowCount,4);}finally{await pool.end();}
 // Use the same rated players for an unrated manual match and compare ranked data.
 await b.goto('http://localhost:3000/play');await b.getByRole('button',{name:'Find Match',exact:true}).waitFor();
 const name=`Stats manual ${suffix}`;await a.getByRole('button',{name:'Create Room',exact:true}).click();await a.getByLabel('Room name',{exact:true}).fill(name);await a.getByRole('button',{name:'Create and join',exact:true}).click();await b.getByRole('button',{name:`Join ${name}`,exact:true}).click();
 for(const p of pages)await p.getByRole('button',{name:"I'm ready",exact:true}).click();await a.getByRole('button',{name:'Start Match',exact:true}).click();for(const p of pages)await p.locator('canvas').waitFor();await until(()=>latest.every(s=>s.gameId!==rematchId&&s.match.status==='IN_GAME'));
 await until(()=>latest.every(s=>s.match.status==='FINISHED'&&s.match.persistence==='SAVED'),35000);
 const manualA=await stats(a);for(const key of ['mmr','peakMmr','wins','losses','ties','ratedMatches','currentWinStreak','bestWinStreak','rank','eliminations','deaths','recentForm'])assert.deepEqual(manualA[key],secondA[key],key);assert.equal(manualA.totalMatches,3);assert.equal(manualA.unratedMatches,1);
 for(const width of [1280,768,390])for(const route of ['leaderboard','profile','dashboard']){await a.setViewportSize({width,height:900});await a.goto(`http://localhost:3000/${route}`);await a.locator(route==='leaderboard'?'.ranking-card':'.division-progress').first().waitFor();assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} ${width}`);if(route==='leaderboard'){assert.equal(await a.locator('.ranking-card.is-self').count(),1);await a.getByText(`Your rank #${manualA.rank}`,{exact:true}).waitFor();}else{assert.equal(await a.locator('.form-outcome').count(),2);await a.getByText('1015',{exact:false}).first().waitFor();}await a.screenshot({path:join(artifacts,`${route}-${width}.png`),fullPage:true});}
 await a.goto('http://localhost:3000/matches');await a.locator('.history-card').first().waitFor();assert.equal(await a.getByText('Rated matchmaking',{exact:true}).count(),2);assert.equal(await a.getByText('Unrated manual',{exact:true}).count(),1);
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 console.log(JSON.stringify({result:'PASS',scenario:'Phase 8: defaults/Silver, ranked stats, leaderboard/rank, tie streak reset/peak, same-player unrated isolation, profile/dashboard/leaderboard at 1280/768/390, history labels. Two players: queue/cancel, queued refresh, proposal decline/requeue/cooldown, proposal refresh, acceptance, automatic arena, combat, Elo +16/-16, saved results/history, finished refresh, second matchmaking, responsive offer/results/history, no console errors',snapshotCounts:history.map(h=>h.length),errors,consoleErrors,artifacts}));
}catch(error){
 console.log('FAILURE', {message:error.message,errors,consoleErrors,last:latest.map(s=>s && {tick:s.tick,players:s.players,projectiles:s.projectiles}),artifacts});
 for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:join(artifacts,`failure-${browser.contexts().indexOf(context)}.png`),fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await browser.close();const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const ids=[...new Set(history.flat().map(s=>s.gameId))];await pool.query('DELETE FROM "Match" WHERE id = ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM "User" WHERE email = ANY($1::text[])',[emails]);}finally{await pool.end();}
}
