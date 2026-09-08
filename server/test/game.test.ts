import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ARENA } from "@arena/shared/game";
import type { GameInput, RoomState } from "@arena/shared";
import { GameInstance, GameManager } from "../src/game/manager.js";
import { parseEnv } from "../src/config/env.js";
const room = (): RoomState => ({id:randomUUID(),gameId:randomUUID(),code:"ABC234",name:"Arena",visibility:"PUBLIC",status:"IN_GAME",hostPlayerProfileId:"p0",maxPlayers:8,createdAt:"now",players:Array.from({length:8},(_,i)=>({playerProfileId:`p${i}`,username:`p${i}`,displayName:`Player ${i}`,ready:true,connected:true,isHost:i===0,joinedAt:"now"}))});
function setup(rate=20) { const r=room();return new GameInstance(r.id,r.gameId!,r,rate); }
const input = (g:GameInstance, sequence=1, changes:Partial<GameInput>={}):GameInput => ({gameId:g.gameId,sequence,up:false,down:false,left:false,right:true,...changes});
test("eight authoritative spawns are unique and safe, with reset input acknowledgements",()=>{
 const g=setup();const p=g.snapshot().players;assert.equal(new Set(p.map(p=>`${p.x}:${p.y}`)).size,8);
 for(const s of p){assert.ok(s.x>=ARENA.radius&&s.x<=ARENA.width-ARENA.radius);assert.ok(s.y>=ARENA.radius&&s.y<=ARENA.height-ARENA.radius);assert.equal(s.lastSequence,0);}g.step();assert.deepEqual(g.snapshot().players,p);
});
test("configured speed is independent of configured simulation frequency",()=>{
 for(const rate of [10,20,60]){const g=setup(rate),start=g.snapshot().players[0]!.x;for(let n=1;n<=rate;n++){g.input("p0",input(g,n));g.step();}assert.ok(Math.abs(g.snapshot().players[0]!.x-start-ARENA.speed)<1e-9);}
});
test("diagonal movement has the same magnitude as cardinal movement",()=>{
 const g=setup(),start=g.snapshot().players[0]!;g.input("p0",input(g,1,{down:true}));g.step();const end=g.snapshot().players[0]!;assert.ok(Math.abs(Math.hypot(end.x-start.x,end.y-start.y)-ARENA.speed/20)<1e-9);
});
test("opposing keys cancel movement",()=>{const g=setup(),start=g.snapshot().players[0]!;g.input("p0",input(g,1,{left:true,up:true,down:true}));g.step();assert.equal(g.snapshot().players[0]!.x,start.x);assert.equal(g.snapshot().players[0]!.y,start.y);});
test("world collision clamps each edge at the player radius",()=>{
 const g=setup();for(const intent of [{right:true,down:true,left:false,up:false},{right:false,down:false,left:true,up:true}]){
  for(let n=1;n<=1000;n++){g.input("p0",input(g,g.tick+1,intent));g.step();}
  const p=g.snapshot().players[0]!;assert.equal(p.x,intent.right?ARENA.width-ARENA.radius:ARENA.radius);assert.equal(p.y,intent.down?ARENA.height-ARENA.radius:ARENA.radius);
 }
});
test("many packets between ticks coalesce to a single bounded movement step",()=>{const g=setup(),start=g.snapshot().players[0]!.x;for(let n=1;n<=100;n++)g.input("p0",input(g,n));g.step();assert.equal(g.snapshot().players[0]!.x,start+13);assert.equal(g.snapshot().players[0]!.lastSequence,100);});
test("duplicate and out-of-order sequences do not change direction or buy time",()=>{const g=setup();g.input("p0",input(g,5));g.input("p0",input(g,4,{right:false,left:true}));g.step();const x=g.snapshot().players[0]!.x;g.input("p0",input(g,5));g.step();assert.equal(g.snapshot().players[0]!.x,x);assert.equal(g.snapshot().players[0]!.lastSequence,5);});
test("missing packets stop movement instead of carrying an old intent indefinitely",()=>{const g=setup();g.input("p0",input(g));g.step();const x=g.snapshot().players[0]!.x;for(let n=0;n<100;n++)g.step();assert.equal(g.snapshot().players[0]!.x,x);});
test("disconnect clears queued input and freezes the player",()=>{const g=setup();const x=g.snapshot().players[0]!.x;g.input("p0",input(g));g.freeze("p0");g.step();assert.equal(g.snapshot().players[0]!.x,x);assert.throws(()=>g.input("p0",input(g)),/not controlling/);});
test("snapshot copies are safe and cannot mutate canonical positions",()=>{const g=setup();const s=g.snapshot(123);s.players[0]!.x=-999;assert.ok(g.snapshot().players[0]!.x>0);assert.equal(s.serverTime,123);assert.equal(s.snapshotRate,10);assert.deepEqual(Object.keys(s.players[0]!).sort(),['connected','displayName','lastSequence','playerProfileId','username','x','y'].sort());});
test("manager rejects forged fields, invalid booleans, and non-integer sequences",()=>{
 const m=new GameManager(),r=room();m.reconcileRooms({rooms:{[r.id]:r},codes:{},playerRooms:{}});const g=m.games.get(r.gameId!)!;
 for(const change of [{x:0},{speed:999},{playerProfileId:'p1'},{sequence:0},{sequence:1.2},{sequence:Infinity},{up:1},{delta:5},{tick:99}])assert.throws(()=>m.input('p0',{...input(g),...change}),/Invalid movement/);
 assert.throws(()=>m.input('outsider',input(g)),/not controlling/);assert.throws(()=>m.input('p0',{...input(g),gameId:randomUUID()}),/No active/);
});
test("manager synchronizes room membership without resetting existing positions",()=>{
 const m=new GameManager(),r=room(),state={rooms:{[r.id]:r},codes:{},playerRooms:{}};m.reconcileRooms(state);const g=m.games.get(r.gameId!)!;g.input('p0',input(g));m.step();const x=m.sync('p0')!.players[0]!.x;m.reconcileRooms(state);assert.equal(m.sync('p0')!.players[0]!.x,x);
 r.players=r.players.slice(1);m.reconcileRooms(state);assert.equal(m.sync('p0'),null);assert.equal(m.games.size,1);m.reconcileRooms({rooms:{},codes:{},playerRooms:{}});assert.equal(m.games.size,0);
});
test("manual simulation runs multiple games without database or Redis dependencies",()=>{
 let broadcasts=0;const m=new GameManager(20,()=>broadcasts++),a=room(),b=room();m.reconcileRooms({rooms:{[a.id]:a,[b.id]:b},codes:{},playerRooms:{}});for(let n=0;n<20;n++)m.step();assert.equal(broadcasts,20);assert.ok([...m.games.values()].every(g=>g.tick===20));m.close();assert.equal(m.games.size,0);
});
test("tick-rate configuration validates bounded integral rates",()=>{assert.equal(parseEnv({}).gameTickRate,20);for(const value of ['0','9','61','1.5','NaN'])assert.throws(()=>parseEnv({GAME_TICK_RATE:value}),/GAME_TICK_RATE/);});
