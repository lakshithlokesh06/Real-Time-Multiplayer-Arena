import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
test('additive match and rating migrations preserve populated accounts, sessions and historical matches',async()=>{
 const source=process.env.TEST_DATABASE_URL;if(!source||!new URL(source).pathname.endsWith('_test'))throw new Error('Dedicated _test database required');
 const db=new Client({connectionString:source});await db.connect();const schema=`upgrade_${randomUUID().replaceAll('-','')}`;
 try{await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}"`);await db.query(await readFile('prisma/migrations/20260908050000_player_accounts/migration.sql','utf8'));
 const user=randomUUID();await db.query('INSERT INTO "User" (id,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,now())',[user,'migration@example.com','fixture-hash']);await db.query('INSERT INTO "PlayerProfile" (id,"userId",username,"displayName","updatedAt") VALUES ($1,$2,$3,$4,now())',[randomUUID(),user,'migration','Migration Player']);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')',[randomUUID(),user,'f'.repeat(64)]);
 const snapshot=async()=>Promise.all(['User','PlayerProfile','Session'].map(async t=>(await db.query(`SELECT * FROM "${t}" ORDER BY id`)).rows));const before=await snapshot();await db.query(await readFile('prisma/migrations/20260910040000_match_results/migration.sql','utf8'));assert.deepEqual(await snapshot(),before);assert.equal((await db.query('SELECT count(*) FROM "Match"')).rows[0].count,'0');
 const match=randomUUID();const profile=(await db.query('SELECT id FROM "PlayerProfile"')).rows[0].id;
 await db.query('INSERT INTO "Match" (id,"roomId","roomName","startedAt","durationLimitSeconds") VALUES ($1,$2,$3,now(),180)',[match,randomUUID(),'Existing match']);
 await db.query('INSERT INTO "MatchParticipant" (id,"matchId","participantKey","playerProfileId",username,"displayName") VALUES ($1,$2,$3,$3,$4,$5)',[randomUUID(),match,profile,'migration','Migration Player']);
 const oldMatch=(await db.query('SELECT * FROM "Match"')).rows[0],oldParticipant=(await db.query('SELECT * FROM "MatchParticipant"')).rows[0];
 await db.query(await readFile('prisma/migrations/20260911050000_matchmaking_rating/migration.sql','utf8'));
 const upgraded=await snapshot();assert.equal(upgraded[1]![0].rating,1000);delete upgraded[1]![0].rating;assert.deepEqual(upgraded,before);
 const newMatch=(await db.query('SELECT * FROM "Match"')).rows[0];assert.equal(newMatch.roomType,'MANUAL');delete newMatch.roomType;assert.deepEqual(newMatch,oldMatch);
 const newParticipant=(await db.query('SELECT * FROM "MatchParticipant"')).rows[0];for(const column of ['ratingBefore','ratingAfter','ratingDelta']){assert.equal(newParticipant[column],null);delete newParticipant[column];}assert.deepEqual(newParticipant,oldParticipant);

 }finally{await db.query('SET search_path TO public');await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();}
});
