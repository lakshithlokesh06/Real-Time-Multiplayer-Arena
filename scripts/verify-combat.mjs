// Run from the repository root with both development servers running.
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
  await p.goto('http://localhost:3000/register');await p.getByLabel('Email',{exact:true}).fill(emails[i]);await p.getByLabel('Username',{exact:true}).fill(`qa_${i}_${suffix}`);await p.getByLabel('Display name',{exact:true}).fill(i===0?'Lobby Alpha':'Lobby Bravo');await p.getByLabel('Password',{exact:true}).fill('A unique lobby test passphrase 85');await p.getByLabel('Confirm password',{exact:true}).fill('A unique lobby test passphrase 85');await p.getByRole('button',{name:'Create account',exact:true}).click();await p.waitForURL('http://localhost:3000/dashboard');await p.getByRole('link',{name:'Play',exact:true}).click();await p.getByRole('status').filter({hasText:/^Connected$/}).waitFor({timeout:10000}).catch(async error=>{console.log('BROWSER STATE',await p.locator('body').innerText(),errors,consoleErrors);await p.screenshot({path:join(artifacts, 'failure.png'),fullPage:true});throw error;});
 }
 const name=`Live arena ${suffix}`;
 await a.getByRole('button',{name:'Create Room',exact:true}).click();await a.getByLabel('Room name',{exact:true}).fill(name);await a.getByRole('button',{name:'Create and join',exact:true}).click();
 await b.getByRole('button',{name:`Join ${name}`,exact:true}).click();
 await b.getByRole('button',{name:"I'm ready",exact:true}).click();await a.getByRole('button',{name:"I'm ready",exact:true}).click();await a.getByRole('button',{name:'Start Match',exact:true}).click();
 for(const p of pages){await p.locator('canvas').waitFor();await p.getByRole('button',{name:'Network debug',exact:true}).click();}
 async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Condition timeout');}
 await until(()=>latest.every(s=>s?.players.length===2));
 const ids=latest[0].players.map(p=>p.playerProfileId);const at=(viewer,index)=>latest[viewer].players.find(p=>p.playerProfileId===ids[index]);
 assert.equal(latest[0].gameId,latest[1].gameId);const gameId=latest[0].gameId;
 async function move(p,keys,ms){await p.bringToFront();await p.locator('.arena-canvas').focus();for(const key of keys)await p.keyboard.down(key);await p.waitForTimeout(ms);for(const key of keys)await p.keyboard.up(key);await p.waitForTimeout(250);}
 // Aim along the authoritative target direction, using the bounded camera transform.
 async function aim(viewer,target){
  const p=pages[viewer];await p.bringToFront();await p.waitForTimeout(1000);
  const box=await p.locator('canvas').boundingBox();const self=at(viewer,viewer),other=at(viewer,target);
  const zoom=Math.min(1,box.width/700,box.height/420),vw=box.width/zoom,vh=box.height/zoom;
  const sx=Math.max(0,Math.min(1600-vw,self.x-vw/2)),sy=Math.max(0,Math.min(900-vh,self.y-vh/2));
  const length=Math.hypot(other.x-self.x,other.y-self.y);
  await p.mouse.move(box.x+(self.x-sx+(other.x-self.x)/length*90)*zoom,box.y+(self.y-sy+(other.y-self.y)/length*90)*zoom);
 }
 assert.equal(at(0,0).health,100);assert.equal(at(1,1).health,100);
 // Clicking React controls must never fire.
 await a.getByRole('button',{name:'Network debug',exact:true}).click();await a.waitForTimeout(250);assert.equal(history[0].some(s=>s.projectiles.length),false);
 await aim(0,1);await a.mouse.down();await a.mouse.up();
 await until(()=>history[1].some(s=>s.projectiles.some(p=>p.ownerPlayerProfileId===ids[0])));
 await until(()=>at(1,1).health===75);
 await b.getByText('Health: 75 / 100',{exact:true}).waitFor();
 assert.equal(at(0,0).health,100);
 const before={x:at(1,1).x,y:at(1,1).y};latest[1]=null;await b.reload();await b.locator('canvas').waitFor();await until(()=>latest[1]?.players.some(p=>p.playerProfileId===ids[1]&&p.connected));
 assert.equal(at(1,1).health,75);assert.equal(at(1,1).alive,true);assert.equal(at(1,1).x,before.x);assert.equal(latest[1].gameId,gameId);
 await aim(0,1);await a.mouse.down();await until(()=>!at(1,1).alive);await a.mouse.up();
 assert.equal(at(1,1).health,0);assert.equal(at(1,1).deaths,1);assert.equal(at(0,0).eliminations,1);assert.equal(at(0,0).health,100);
 await b.getByRole('status').filter({hasText:'Respawning in'}).waitFor();assert.equal(await b.locator('main').getByRole('alert').count(),0);
 await b.screenshot({path:join(artifacts,'eliminated.png'),fullPage:true});
 const dead={x:at(1,1).x,y:at(1,1).y,remaining:at(1,1).respawnInMs};
 await b.bringToFront();await b.locator('.arena-canvas').focus();await b.keyboard.down('d');await b.mouse.click(600,500);await b.waitForTimeout(200);await b.keyboard.up('d');
 assert.equal(at(1,1).x,dead.x);assert.equal(history[1].some(s=>s.projectiles.some(p=>p.ownerPlayerProfileId===ids[1])),false);
 latest[1]=null;await b.reload();await b.locator('canvas').waitFor();await until(()=>latest[1]?.players.some(p=>p.playerProfileId===ids[1]&&p.connected));
 assert.equal(at(1,1).alive,false);assert.ok(at(1,1).respawnInMs<=dead.remaining);assert.equal(at(1,1).deaths,1);
 await until(()=>at(1,1).alive,5000);assert.equal(at(1,1).health,100);assert.equal(at(1,1).life,1);
 await b.getByText('Health: 100 / 100',{exact:true}).waitFor();
 const respawnX=at(1,1).x;await move(b,['d'],250);assert.ok(at(1,1).x>respawnX);
 await aim(1,0);await b.mouse.down();await b.mouse.up();await until(()=>latest[0].projectiles.some(p=>p.ownerPlayerProfileId===ids[1]));
 await until(()=>at(0,0).health===75);await a.getByText('Health: 75 / 100',{exact:true}).waitFor();
 const creations=new Map();for(const s of history[0])for(const p of s.projectiles)if(p.ownerPlayerProfileId===ids[0]&&!creations.has(p.id))creations.set(p.id,s.tick);
 const shotTicks=[...creations.values()];assert.ok(shotTicks.length>=4);for(let i=1;i<shotTicks.length;i++)assert.ok(shotTicks[i]-shotTicks[i-1]>=5,'Server cooldown bounds observed shots');
 await a.screenshot({path:join(artifacts,'combat.png'),fullPage:true});
 await b.setViewportSize({width:768,height:1024});await b.waitForTimeout(250);assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await b.screenshot({path:join(artifacts,'tablet.png'),fullPage:true});
 await b.setViewportSize({width:390,height:844});await b.waitForTimeout(250);assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await b.screenshot({path:join(artifacts,'mobile.png'),fullPage:true});
 // Fire a live projectile, then leave before it reaches its target.
 await aim(0,1);await a.mouse.down();await a.mouse.up();await until(()=>latest[1].projectiles.some(p=>p.ownerPlayerProfileId===ids[0]));
 await a.getByRole('button',{name:'Leave Arena',exact:true}).click();await a.getByRole('heading',{name:'Find your next crew.',exact:true}).waitFor();await until(()=>latest[1].players.length===1);assert.equal(latest[1].projectiles.some(p=>p.ownerPlayerProfileId===ids[0]),false);await b.getByRole('status').filter({hasText:'1 players'}).waitFor();assert.equal(await a.locator('canvas').count(),0);
 await b.getByRole('button',{name:'Leave Arena',exact:true}).click();await b.getByRole('heading',{name:'Find your next crew.',exact:true}).waitFor();assert.equal(await b.locator('canvas').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 console.log(JSON.stringify({result:'PASS',scenario:'Two authenticated sessions: launch, mouse aim/fire, visible authoritative projectiles, damage, elimination/counters, dead controls disabled, countdown, damaged/dead refresh, respawn, movement/fire restored, cooldown, self-hit exclusion, UI click isolation, leave/projectile cleanup, responsive HUD, no significant console errors',observedShotTicks:shotTicks,snapshotCounts:history.map(h=>h.length),errors,consoleErrors,artifacts}));
}catch(error){
 console.log('FAILURE', {message:error.message,errors,consoleErrors,last:latest.map(s=>s && {tick:s.tick,players:s.players,projectiles:s.projectiles}),artifacts});
 for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:join(artifacts,`failure-${browser.contexts().indexOf(context)}.png`),fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await browser.close();const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await pool.query('DELETE FROM "User" WHERE email = ANY($1::text[])',[emails]);}finally{await pool.end();}
}
