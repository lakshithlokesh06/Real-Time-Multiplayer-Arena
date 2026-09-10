import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ARENA, COMBAT, segmentCircle } from "@arena/shared/game";
import type { CombatIntent, RoomState } from "@arena/shared";
import { GameInstance, GameManager } from "../src/game/manager.js";
import { combatSchema, respawnPosition } from "../src/game/combat.js";
function setup(count=2, rate=20) {
 const room: RoomState = {id:randomUUID(),gameId:randomUUID(),code:'ABC234',name:'Combat',visibility:'PUBLIC',status:'IN_GAME',hostPlayerProfileId:'a',maxPlayers:8,createdAt:'now',players:Array.from({length:count},(_,i)=>({playerProfileId:String.fromCharCode(97+i),username:`p${i}`,displayName:`Player ${i}`,ready:true,connected:true,isHost:i===0,joinedAt:'now'}))};
 const manager=new GameManager(rate);manager.reconcileRooms({rooms:{[room.id]:room},codes:{},playerRooms:{}});
 const game=manager.games.get(room.gameId!)!;
 for (const [id,p] of game.players) {p.state.x=id==='a'?200:600;p.state.y=450;}
 return {manager,game,room};
}
function intent(game:GameInstance, id='a', change:Partial<CombatIntent>={}):CombatIntent {const p=game.players.get(id)!.state;return {gameId:game.gameId,sequence:p.lastCombatSequence+1,life:p.life,aimX:1,aimY:0,...change};}
function fire(game:GameInstance,id='a',change:Partial<CombatIntent>={}) {game.combat.intent(id,intent(game,id,change),true,game.tick);}
function step(game:GameInstance,n=1){for(let i=0;i<n;i++)game.step();}
function kill(game:GameInstance){for(let i=0;i<4;i++){fire(game);step(game,10);}assert.equal(game.players.get('b')!.state.alive,false);}
test('valid fire generates authoritative ID, muzzle, speed, damage, lifetime and normalized aim',()=>{
 const {game,manager}=setup();manager.combatIntent('a',intent(game,'a',{aimX:.5}),true);step(game);
 const p=[...game.combat.projectiles.values()][0]!;assert.match(p.id,/^[0-9a-f-]{36}$/);assert.equal(p.x,226);assert.equal(p.y,450);assert.equal(p.directionX,1);assert.equal(p.speed,800);assert.equal(p.damage,25);assert.equal(p.expiresTick-p.createdTick,40);
});
test('aim updates direction without creating a projectile',()=>{const {game,manager}=setup();manager.combatIntent('a',intent(game,'a',{aimX:.5,aimY:.5}),false);step(game);assert.equal(game.combat.projectiles.size,0);assert.ok(Math.abs(game.players.get('a')!.state.aimX-Math.SQRT1_2)<1e-12);});
test('strict combat schema rejects malformed vectors and forged outcomes',()=>{
 const {game,manager}=setup();for(const change of [{aimX:NaN},{aimX:Infinity},{aimX:2},{aimX:0,aimY:0},{aimY:'1'},{sequence:0},{sequence:1.2},{life:-1},{damage:999},{health:100},{alive:true},{hit:'b'},{x:0},{speed:9999},{id:randomUUID()},{eliminations:99},{respawnInMs:0},{ownerPlayerProfileId:'b'}])assert.throws(()=>manager.combatIntent('a',{...intent(game),...change},true),/Invalid combat/);
 assert.equal(combatSchema.safeParse(intent(game,'a',{aimX:1e-10})).success,false);
});
test('wrong game and nonmembers cannot fire',()=>{const {game,manager}=setup();assert.throws(()=>manager.combatIntent('a',{...intent(game),gameId:randomUUID()},true),/No active/);assert.throws(()=>manager.combatIntent('outsider',intent(game),true),/unavailable/);});
test('dead and disconnected players cannot aim or fire',()=>{const {game,manager}=setup();game.players.get('a')!.state.alive=false;for(const fire of [false,true])manager.combatIntent('a',intent(game),fire);assert.equal(game.players.get('a')!.pendingFire,undefined);game.players.get('a')!.state.alive=true;game.freeze('a');assert.throws(()=>manager.combatIntent('a',intent(game),true),/unavailable/);});
test('cooldown uses simulation ticks, including the exact 300 ms boundary',()=>{
 const {game}=setup();fire(game);step(game);for(let i=0;i<5;i++){fire(game);step(game);}assert.equal(game.combat.projectiles.size,1);fire(game);step(game);assert.equal(game.combat.projectiles.size,2);
});
test('fire spam coalesces, stale combat sequences never replay shots',()=>{
 const {game}=setup();const original=intent(game);for(let i=1;i<=500;i++)game.combat.intent('a',{...original,sequence:i},true,game.tick);step(game);assert.equal(game.combat.projectiles.size,1);step(game,6);game.combat.intent('a',{...original,sequence:500},true,game.tick);step(game);assert.equal(game.combat.projectiles.size,1);
});
test('projectiles integrate 40 units per default tick',()=>{const {game}=setup();fire(game);step(game);const p=[...game.combat.projectiles.values()][0]!;const x=p.x;step(game);assert.equal(p.x-x,40);});
test('projectiles expire deterministically at their lifetime deadline',()=>{const {game}=setup(1);fire(game);step(game);const p=[...game.combat.projectiles.values()][0]!;p.speed=0;step(game,39);assert.equal(game.combat.projectiles.size,1);step(game);assert.equal(game.combat.projectiles.size,0);});
test('outward muzzle is bounded and projectile is removed on leaving world',()=>{const {game}=setup(1);game.players.get('a')!.state.x=ARENA.width-ARENA.radius;fire(game);step(game);assert.equal([...game.combat.projectiles.values()][0]!.x,ARENA.width);step(game);assert.equal(game.combat.projectiles.size,0);});
test('swept collision detects tunneling and chooses the first circle intersection',()=>{assert.equal(segmentCircle(0,0,100,0,50,0,10),.4);assert.equal(segmentCircle(0,0,100,0,50,30,10),null);assert.equal(segmentCircle(50,0,50,0,50,0,10),0);});
test('high-speed projectile hits a target between tick endpoints',()=>{const {game}=setup();fire(game);step(game);const p=[...game.combat.projectiles.values()][0]!;p.speed=20000;step(game);assert.equal(game.players.get('b')!.state.health,75);assert.equal(game.combat.projectiles.size,0);});
test('a moving target crossing the projectile path is hit',()=>{const {game}=setup();fire(game);step(game);const p=[...game.combat.projectiles.values()][0]!;const target=game.players.get('b')!;target.previousX=p.x+20;target.previousY=420;target.state.x=p.x+20;target.state.y=480;game.combat.step(game.tick+1);assert.equal(target.state.health,75);});
test('muzzle sweep hits close opponents rather than skipping through them',()=>{const {game}=setup();game.players.get('b')!.state.x=220;fire(game);step(game);assert.equal(game.players.get('b')!.state.health,75);assert.equal(game.combat.projectiles.size,0);});
test('own projectiles never damage their owner',()=>{const {game}=setup(1);fire(game);step(game);const p=[...game.combat.projectiles.values()][0]!;p.x=150;p.directionX=1;step(game,4);assert.equal(game.players.get('a')!.state.health,100);});
test('one non-piercing projectile damages only the nearest target',()=>{const {game}=setup(3);game.players.get('c')!.state.x=650;fire(game);step(game);[...game.combat.projectiles.values()][0]!.speed=20000;step(game);assert.equal(game.players.get('b')!.state.health,75);assert.equal(game.players.get('c')!.state.health,100);});
test('four hits eliminate once and update live attacker/victim counters',()=>{const {game}=setup();kill(game);const victim=game.players.get('b')!.state;assert.equal(victim.health,0);assert.equal(victim.deaths,1);assert.equal(game.players.get('a')!.state.eliminations,1);fire(game);step(game,10);assert.equal(victim.health,0);assert.equal(victim.deaths,1);});
test('damage clamps at zero and cannot produce negative health',()=>{const {game}=setup();game.players.get('b')!.state.health=1;fire(game);step(game,10);assert.equal(game.players.get('b')!.state.health,0);});
test('dead movement/fire are rejected and queued input is cleared',()=>{const {game}=setup();kill(game);const victim=game.players.get('b')!;assert.equal(victim.pending,undefined);assert.equal(victim.pendingFire,undefined);game.input('b',{gameId:game.gameId,sequence:1,up:false,down:false,left:true,right:false});fire(game,'b');assert.equal(victim.pending,undefined);assert.equal(victim.pendingFire,undefined);});
test('respawn occurs at the exact deadline, restores health and rejects old-life input',()=>{
 const {game}=setup();kill(game);const victim=game.players.get('b')!;const deadline=victim.respawnTick;step(game,deadline-game.tick-1);assert.equal(victim.state.alive,false);step(game);assert.equal(victim.state.alive,true);assert.equal(victim.state.health,100);assert.equal(victim.state.life,1);assert.equal(victim.state.respawnInMs,0);assert.equal(victim.pending,undefined);assert.equal(victim.pendingFire,undefined);assert.equal(victim.state.deaths,1);
 game.input('b',{gameId:game.gameId,life:0,sequence:1,up:false,down:false,left:true,right:false});fire(game,'b',{life:0});assert.equal(victim.pending,undefined);assert.equal(victim.pendingFire,undefined);
 game.input('b',{gameId:game.gameId,life:1,sequence:1,up:false,down:false,left:false,right:true});const x=victim.state.x;step(game);assert.equal(victim.state.x,x+13);fire(game,'b');step(game);assert.ok([...game.combat.projectiles.values()].some(p=>p.ownerPlayerProfileId==='b'));
});
test('respawn chooses a deterministic farthest safe candidate',()=>{const {game}=setup();game.players.get('a')!.state.x=100;game.players.get('a')!.state.y=100;const p=respawnPosition(game.players.values(),'b');assert.deepEqual(p,{x:1500,y:800});assert.ok(p.x>18&&p.x<1582&&p.y>18&&p.y<882);});
test('grace-disconnected players remain damageable but cannot queue shots',()=>{const {game}=setup();game.freeze('b');fire(game);step(game,10);assert.equal(game.players.get('b')!.state.health,75);assert.throws(()=>fire(game,'b'),/unavailable/);});
test('freeze clears queued fire without resetting health, cooldown or counters',()=>{const {game}=setup();fire(game);game.freeze('a');step(game);assert.equal(game.combat.projectiles.size,0);assert.equal(game.players.get('a')!.state.health,100);});
test('room reconciliation restores controller connection without healing or resetting death timers',()=>{
 const {game,manager,room}=setup();kill(game);game.freeze('b');const before={...game.players.get('b')!.state},deadline=game.players.get('b')!.respawnTick;manager.reconcileRooms({rooms:{[room.id]:room},codes:{},playerRooms:{}});const after=game.players.get('b')!.state;assert.deepEqual(after,{...before,connected:true});assert.equal(game.players.get('b')!.respawnTick,deadline);
});
test('leave removes only owned projectiles and empty manager state is cleaned',()=>{const {game,manager}=setup();fire(game);fire(game,'b',{aimX:0,aimY:1});step(game);assert.equal(game.combat.projectiles.size,2);manager.remove('a');assert.equal(game.combat.projectiles.size,1);assert.equal([...game.combat.projectiles.values()][0]!.ownerPlayerProfileId,'b');manager.remove('b');assert.equal(game.combat.projectiles.size,0);assert.equal(manager.games.size,0);});
test('combat snapshots expose only safe state and copy projectile records',()=>{const {game}=setup();fire(game);step(game);const s=game.snapshot();assert.equal(s.players[0]!.health,100);assert.equal(s.players[0]!.alive,true);assert.deepEqual(Object.keys(s.projectiles[0]!).sort(),['id','ownerPlayerProfileId','x','y','directionX','directionY'].sort());s.projectiles[0]!.x=-100;assert.ok(game.snapshot().projectiles[0]!.x>=0);for(const field of ['email','password','session','expiresTick','nextShotTick','damage','speed'])assert.ok(!JSON.stringify(s).includes(field));});
test('several games simulate combat with bounded projectile counts and no storage dependencies',()=>{
 const {game,manager}=setup(1);const other=setup(1).game;manager.games.set(other.gameId,other);for(let i=0;i<1000;i++){fire(game);fire(other);manager.step();}for(const instance of [game,other]){assert.equal(instance.tick,1000);assert.ok(instance.combat.projectiles.size<=Math.ceil(COMBAT.projectileLifetimeMs/COMBAT.fireCooldownMs));}
});
