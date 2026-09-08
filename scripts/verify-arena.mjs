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
 const aStart=at(0,0).x;await move(a,['a'],700);await until(()=>at(1,0).x<aStart-70);assert.ok(at(0,0).x<aStart-70);
 const bStart=at(1,1).y;await move(b,['s'],700);await until(()=>at(0,1).y>bStart+70);assert.ok(at(1,1).y>bStart+70);
 // Inspect authoritative displacement per server tick from actual browser snapshots.
 const speeds=[];
 async function measured(keys){const from=history[0].length;await move(a,keys,800);const samples=history[0].slice(from);const values=[];for(let n=1;n<samples.length;n++){const first=samples[n-1],second=samples[n];const p=first.players[0],q=second.players[0];const speed=Math.hypot(q.x-p.x,q.y-p.y)/((second.tick-first.tick)/second.tickRate);if(speed>1)values.push(speed);}assert.ok(values.length>=3);assert.ok(values.every(v=>v<=260.001));return Math.max(...values);}
 await a.screenshot({path:join(artifacts, 'two-players.png'),fullPage:true});
 speeds.push(await measured(['ArrowLeft']));speeds.push(await measured(['a','w']));assert.ok(Math.abs(speeds[0]-speeds[1])<0.01);
 await move(a,['w'],3000);assert.equal(at(0,0).y,18);await move(a,['a'],3500);assert.equal(at(0,0).x,18);
 assert.ok(history.flat().every(s=>s.players.every(p=>p.x>=18&&p.x<=1582&&p.y>=18&&p.y<=882)));
 // Put the player away from the spawn and edge, then refresh in place.
 await move(a,['d','s'],600);const before={x:at(0,0).x,y:at(0,0).y};
 await a.reload();await a.locator('canvas').waitFor();await until(()=>latest[0].gameId===gameId&&at(0,0).connected);
 assert.ok(Math.abs(at(0,0).x-before.x)<0.01);assert.ok(Math.abs(at(0,0).y-before.y)<0.01);assert.equal(await a.locator('canvas').count(),1);assert.equal(await b.locator('canvas').count(),1);
 await a.getByRole('button',{name:'Network debug',exact:true}).click();await a.screenshot({path:join(artifacts, 'desktop.png'),fullPage:true});
 await b.setViewportSize({width:768,height:1024});await b.waitForTimeout(250);assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await b.screenshot({path:join(artifacts, 'tablet.png'),fullPage:true});
 await b.setViewportSize({width:390,height:844});await b.waitForTimeout(250);assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await b.screenshot({path:join(artifacts, 'mobile.png'),fullPage:true});
 await a.getByRole('button',{name:'Leave Arena',exact:true}).click();await a.getByRole('heading',{name:'Find your next crew.',exact:true}).waitFor();await until(()=>latest[1].players.length===1);await b.getByRole('status').filter({hasText:'1 players'}).waitFor();assert.equal(await a.locator('canvas').count(),0);
 await b.getByRole('button',{name:'Leave Arena',exact:true}).click();await b.getByRole('heading',{name:'Find your next crew.',exact:true}).waitFor();assert.equal(await b.locator('canvas').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 console.log(JSON.stringify({result:'PASS',scenario:'Two authenticated browser sessions: room/join/ready/start, one Phaser canvas each, bidirectional observed movement, cardinal/diagonal speed, world edges, refresh position/match recovery, leave/removal, tablet/mobile overflow, no page or significant console errors',measuredSpeeds:speeds,snapshotCounts:history.map(h=>h.length),errors,consoleErrors,artifacts}));
}finally{
 await browser.close();const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await pool.query('DELETE FROM "User" WHERE email = ANY($1::text[])',[emails]);}finally{await pool.end();}
}
