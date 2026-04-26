// Tier 4.7 Friend list — unit verification.
const friends = require('./world/friends');
const fs = require('fs');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === normalize ===
{
  check('normalize lowercases', friends.normalize('Alice') === 'alice');
  check('normalize trims', friends.normalize('  Bob  ') === 'bob');
  check('normalize handles empty', friends.normalize('') === '');
  check('normalize handles null/undefined', friends.normalize(null) === '' && friends.normalize(undefined) === '');
}

// === isValidName ===
{
  check('isValidName accepts plain', friends.isValidName('Alice'));
  check('isValidName accepts lowercase', friends.isValidName('alice'));
  check('isValidName rejects too short', !friends.isValidName('Al'));
  check('isValidName rejects too long', !friends.isValidName('Alexandriaaaaaa'));
  check('isValidName rejects digits', !friends.isValidName('Alice1'));
  check('isValidName rejects spaces', !friends.isValidName('Alice Bob'));
  check('isValidName rejects symbols', !friends.isValidName('Al!ce'));
  check('isValidName rejects empty', !friends.isValidName(''));
  check('isValidName rejects non-string', !friends.isValidName(123) && !friends.isValidName(null));
}

// === loadFriends ===
{
  check('loadFriends preserves valid lowercase entries',
    JSON.stringify(friends.loadFriends(['alice', 'bob'])) === '["alice","bob"]');
  check('loadFriends lowercases mixed case',
    JSON.stringify(friends.loadFriends(['Alice', 'BOB'])) === '["alice","bob"]');
  check('loadFriends drops duplicates',
    friends.loadFriends(['alice', 'Alice', 'bob']).length === 2);
  check('loadFriends drops invalid entries',
    friends.loadFriends(['alice', '', 'X1', 'bob', 'too long' + 'x'.repeat(20), null]).length === 2);
  check('loadFriends caps at MAX_FRIENDS', () => {
    const big = Array.from({ length: friends.MAX_FRIENDS + 5 }, (_, i) => 'name' + 'a'.repeat(2 + (i % 5)));
    return friends.loadFriends(big.filter(n => friends.isValidName(n))).length <= friends.MAX_FRIENDS;
  });
  // Wait, need to actually evaluate the function above
}
// Re-check the cap correctly
{
  const validNames = [];
  // Generate 60 unique 3-12 char alpha names
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < 60 && validNames.length < 60; i++) {
    let n = '';
    let q = i;
    do {
      n = alphabet[q % 26] + n;
      q = Math.floor(q / 26);
    } while (q > 0);
    while (n.length < 3) n = 'a' + n;
    if (friends.isValidName(n)) validNames.push(n);
  }
  const loaded = friends.loadFriends(validNames);
  // Re-do the cap check, now correctly
  checks.pop();  // remove the placeholder
  check('loadFriends caps at MAX_FRIENDS', loaded.length === friends.MAX_FRIENDS);
}

{
  check('loadFriends handles non-array', friends.loadFriends(null).length === 0 && friends.loadFriends('').length === 0);
}

// === add ===
{
  const list = [];
  const r1 = friends.add(list, 'Alice', 'Bob');
  check('add accepts valid name', r1.ok && r1.name === 'alice' && list.length === 1);
  const r2 = friends.add(list, 'BOB', 'Bob');
  check('add rejects self', !r2.ok && /yourself/i.test(r2.error));
  const r3 = friends.add(list, 'Alice', 'Carol');
  check('add rejects duplicate', !r3.ok && /already/i.test(r3.error));
  const r4 = friends.add(list, 'Bad1', 'Carol');
  check('add rejects invalid name', !r4.ok && /letters/i.test(r4.error));
  // Cap
  const cap = [];
  for (let i = 0; i < friends.MAX_FRIENDS; i++) {
    const n = 'a' + 'b'.repeat((i % 10) + 2) + (i < 26 ? String.fromCharCode(97 + i) : '');
    if (friends.isValidName(n) && !cap.includes(n.toLowerCase())) cap.push(n.toLowerCase());
  }
  while (cap.length < friends.MAX_FRIENDS) {
    const filler = 'fff' + 'g'.repeat(cap.length % 5);
    if (!cap.includes(filler)) cap.push(filler);
    else break;
  }
  // Force-fill manually if generation didn't reach MAX
  while (cap.length < friends.MAX_FRIENDS) cap.push('xxx' + 'y'.repeat(cap.length % 5 + 1));
  const dedup = Array.from(new Set(cap)).slice(0, friends.MAX_FRIENDS);
  while (dedup.length < friends.MAX_FRIENDS) dedup.push('z'.repeat(3 + dedup.length % 9));
  const dedupCapped = Array.from(new Set(dedup)).slice(0, friends.MAX_FRIENDS);
  // Use a simpler cap test: directly mutate
  const capList = [];
  for (let i = 0; i < friends.MAX_FRIENDS; i++) capList.push('xxx' + i);  // not valid names but bypasses validation in cap check
  // Simpler approach: pre-fill with valid names
  const realCap = [];
  for (let i = 0; i < friends.MAX_FRIENDS; i++) {
    const ch = String.fromCharCode(97 + (i % 26));
    realCap.push(ch + ch + ch + (i >= 26 ? String.fromCharCode(97 + Math.floor(i / 26)) : ''));
  }
  const uniqCap = Array.from(new Set(realCap));
  while (uniqCap.length < friends.MAX_FRIENDS) uniqCap.push('cap' + 'a'.repeat(uniqCap.length % 9 + 1));
  const dedupCap = Array.from(new Set(uniqCap)).slice(0, friends.MAX_FRIENDS);
  // Now try to add when full
  const r5 = friends.add(dedupCap, 'extra', 'Self');
  check('add rejects when at MAX_FRIENDS cap', !r5.ok && /full/i.test(r5.error));
}

// === remove ===
{
  const list = ['alice', 'bob'];
  const r1 = friends.remove(list, 'Alice');
  check('remove succeeds case-insensitive', r1.ok && list.length === 1 && list[0] === 'bob');
  const r2 = friends.remove(list, 'Alice');
  check('remove rejects not-on-list', !r2.ok);
  const r3 = friends.remove(list, '   ');
  check('remove rejects empty input', !r3.ok);
}

// === has ===
{
  const list = ['alice'];
  check('has finds case-insensitive', friends.has(list, 'Alice') && friends.has(list, 'ALICE'));
  check('has returns false for absent', !friends.has(list, 'Bob'));
}

// === statusList ===
{
  const list = ['alice', 'bob', 'carol'];
  const lookup = (name) => name === 'alice' ? { name: 'Alice', level: 5 } : null;
  const out = friends.statusList(list, lookup);
  check('statusList shape', out.length === 3 && out.every(o => 'online' in o && 'name' in o));
  check('statusList online matches', out[0].online === true && out[0].player.name === 'Alice');
  check('statusList offline matches', out[1].online === false && out[2].online === false);
}

// === whoseFriendsContain ===
{
  const players = [
    { player: { name: 'Alice', friends: ['bob', 'carol'] } },
    { player: { name: 'Dave',  friends: ['bob'] } },
    { player: { name: 'Eve',   friends: ['alice'] } },
    { player: { name: 'NoFriends' } }  // no friends array
  ];
  const watchers = friends.whoseFriendsContain('Bob', players);
  check('whoseFriendsContain finds entries with target on their list',
    watchers.length === 2 &&
    watchers.some(w => w.player.name === 'Alice') &&
    watchers.some(w => w.player.name === 'Dave'));
  // Case-insensitive
  const watchers2 = friends.whoseFriendsContain('CAROL', players);
  check('whoseFriendsContain case-insensitive', watchers2.length === 1 && watchers2[0].player.name === 'Alice');
  // No watchers
  const watchers3 = friends.whoseFriendsContain('Nobody', players);
  check('whoseFriendsContain returns empty for no matches', watchers3.length === 0);
}

// === Server-side wiring checks ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('friends module imported', /require\('\.\/world\/friends'\)/.test(src));
  check('handleFriend defined', /function handleFriend\s*\(/.test(src));
  check('friend/friends routed in dispatcher',
    /command === 'friend' \|\| command === 'friends'/.test(src) && /handleFriend\(socket, player/.test(src));
  check('friends persisted in savePlayer',
    /friends: Array\.isArray\(player\.friends\) \? player\.friends : \[\]/.test(src));
  check('friends loaded via friends.loadFriends',
    /friends: friends\.loadFriends\(data\.friends\)/.test(src));
  check('createPlayer initializes friends array',
    /goalsClaimed: \[\],\s*\n\s*friends: \[\]/.test(src));
  check('login broadcasts to friends',
    /completePlayerLogin[\s\S]+?notifyFriendsOf\(player, `\$\{getDisplayName\(player\)\} has come online/.test(src));
  check('logout broadcasts to friends',
    /has left the Shattered Realms[\s\S]{0,200}notifyFriendsOf\(player, `\$\{getDisplayName\(player\)\} has gone offline/.test(src));
  check('notifyFriendsOf defined', /function notifyFriendsOf\s*\(/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
