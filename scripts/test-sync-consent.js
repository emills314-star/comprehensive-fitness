const assert = require("node:assert/strict");
const fs = require("node:fs");
const { deleteWorkoutData, scanKeys } = require("../api/_lib/installation-data");

const html = fs.readFileSync("index.html", "utf8");
const workoutApi = fs.readFileSync("api/sync/workout.js", "utf8");
const consentApi = fs.readFileSync("api/sync/consent.js", "utf8");
const authorizeApi = fs.readFileSync("api/sync/authorize.js", "utf8");
const pushRevokeApi = fs.readFileSync("api/push/revoke.js", "utf8");
const installationRevokeApi = fs.readFileSync("api/installation/revoke.js", "utf8");

assert.match(html, /workoutCloudSync: false/, "Workout cloud copy must default off");
assert.match(html, /Optional workout cloud copy/, "Settings must expose a separate explicit cloud-copy control");
assert.match(html, /Enabling rest notifications never uploads workouts/, "The disclosure must state notification independence");
assert.match(html, /async function queueActiveWorkoutSync\(\) \{\s*if \(data\.settings\.workoutCloudSync !== true/, "Submission must not queue without consent");
assert.match(html, /async function flushWorkoutSyncQueue\(\) \{\s*if \(data\.settings\.workoutCloudSync !== true/, "Queued mutations must not flush without consent");
assert.doesNotMatch(html.match(/async function registerPushSubscription[\s\S]*?\n      \}/)?.[0] || "", /flushWorkoutSyncQueue/, "Push registration must not activate workout upload");
assert.match(html, /setWorkoutCloudSync\(false[\s\S]*clearWorkoutSyncQueue/, "Disabling consent must stop and clear pending uploads");
assert.match(html, /reconcileWorkoutSyncConsent\(\)/, "Legacy implicit uploads must be revoked on startup/online reconciliation");
assert.match(html, /api\/installation\/revoke/, "Local clearing and fully disabled notifications must revoke installation authorization");

assert.match(workoutApi, /installation\.syncConsent !== "1"/, "The server must enforce consent independently of the client");
assert.match(workoutApi, /EXPIRE.*7776000/, "Workout copies must have a 90-day retention limit");
assert.match(workoutApi, /Buffer\.byteLength\(serializedPayload[\s\S]*262144/, "Workout copies must have a server-enforced payload limit");
assert.match(consentApi, /deleteWorkoutData/, "Consent revocation must delete retained and legacy workout keys");
assert.match(authorizeApi, /Cloud workout copy is not configured/, "Workout authorization must work independently of push configuration");
assert.match(authorizeApi, /cf:rate:sync-authorize:[\s\S]*attempts > 10/, "Public installation authorization must be rate limited");
assert.match(pushRevokeApi, /cancelActiveTimers/, "Push revocation must cancel active server timers");
assert.match(installationRevokeApi, /deleteWorkoutData[\s\S]*cf:install:/, "Installation revocation must delete workout data and credentials");

(async () => {
  const keys = ["cf:workout:install-1:s1", "cf:workout:install-1:s2", "cf:mutation:install-1:m1", "unrelated"];
  const deleted = [];
  const fakeRedis = async (command) => {
    if (command[0] === "SCAN") {
      const pattern = String(command[3]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
      return ["0", keys.filter((key) => new RegExp("^" + pattern + "$").test(key))];
    }
    if (command[0] === "DEL") { deleted.push(...command.slice(1)); return command.length - 1; }
    throw new Error("Unexpected fake Redis command: " + command.join(" "));
  };
  assert.deepEqual(await scanKeys(fakeRedis, "cf:workout:install-1:*"), keys.slice(0, 2));
  const result = await deleteWorkoutData(fakeRedis, "install-1");
  assert.deepEqual(result, { workoutCount: 2, mutationCount: 1 });
  assert(deleted.includes("cf:workouts:install-1"));
  assert(!deleted.includes("unrelated"));

  const securityPath = require.resolve("../api/_lib/security");
  const redisPath = require.resolve("../api/_lib/redis");
  const workoutPath = require.resolve("../api/sync/workout");
  require(securityPath);
  require(redisPath);
  const originalSecurity = require.cache[securityPath].exports;
  const originalRedis = require.cache[redisPath].exports;
  const redisCommands = [];
  const response = () => ({
    statusCode: 0, body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });
  require.cache[redisPath].exports = {
    getHash: async () => ({}),
    setHash: async () => 1,
    redis: async (command) => { redisCommands.push(command); return command[0] === "SET" ? "OK" : 1; }
  };
  require.cache[securityPath].exports = { ...originalSecurity, authorizeInstallation: async () => ({ syncConsent: "0" }) };
  delete require.cache[workoutPath];
  let workoutHandler = require(workoutPath);
  const denied = response();
  await workoutHandler({ method: "POST", headers: {}, body: { installationId: "installation-1", mutationId: "m1", sessionId: "s1", revision: "1", payload: {} } }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(redisCommands.length, 0, "A non-consenting installation must not create mutation or workout keys");

  require.cache[securityPath].exports = { ...originalSecurity, authorizeInstallation: async () => ({ syncConsent: "1" }) };
  delete require.cache[workoutPath];
  workoutHandler = require(workoutPath);
  const accepted = response();
  await workoutHandler({ method: "POST", headers: {}, body: { installationId: "installation-1", mutationId: "m1", sessionId: "s1", revision: "1", payload: { session: { id: "s1" } } } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert(redisCommands.some((command) => command[0] === "EXPIRE" && command.includes(7776000)), "Accepted workout copies must receive the retention TTL");
  const commandCountBeforeOversize = redisCommands.length;
  const oversized = response();
  await workoutHandler({ method: "POST", headers: {}, body: { installationId: "installation-1", mutationId: "m2", sessionId: "s2", revision: "1", payload: { notes: "x".repeat(262145) } } }, oversized);
  assert.equal(oversized.statusCode, 413);
  assert.equal(redisCommands.length, commandCountBeforeOversize, "Oversized payloads must be rejected before Redis writes");
  require.cache[securityPath].exports = originalSecurity;
  require.cache[redisPath].exports = originalRedis;
  delete require.cache[workoutPath];
  console.log("Sync consent tests passed (default-off client, server enforcement, retention, revocation, and deletion).");
})().catch((error) => { console.error(error); process.exitCode = 1; });
