// Tier 4.2 Auction House — unit verification.
// Tests world/auctions.js in isolation + grep-checks the server-side wiring.

const auctions = require('./world/auctions');
const fs = require('fs');
const path = require('path');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

const item = (over = {}) => Object.assign({
  id: 'rusty_dagger',
  name: 'Rusty Dagger',
  type: 'weapon',
  value: 10,
  description: 'a worn dagger'
}, over);

// === emptyState ===
{
  const s = auctions.emptyState();
  check('emptyState shape', Array.isArray(s.active) && Array.isArray(s.pending) && Array.isArray(s.history) && s.nextSeq === 1);
}

// === canList: validation ===
{
  const s = auctions.emptyState();
  check('canList ok with valid args',
    auctions.canList(s, 'Alice', item(), 100, 24).ok);
  check('canList rejects negative bid',
    !auctions.canList(s, 'Alice', item(), 0, 24).ok);
  check('canList rejects oversize duration',
    !auctions.canList(s, 'Alice', item(), 100, 999).ok);
  check('canList rejects undersize duration',
    !auctions.canList(s, 'Alice', item(), 100, 0.5).ok);
  check('canList rejects missing seller',
    !auctions.canList(s, '', item(), 100, 24).ok);
  check('canList rejects missing item',
    !auctions.canList(s, 'Alice', null, 100, 24).ok);
  check('canList default duration applies if null',
    auctions.canList(s, 'Alice', item(), 100, null).durationHrs === auctions.DEFAULT_DURATION_HRS);
}

// === canList: per-seller cap ===
{
  const s = auctions.emptyState();
  for (let i = 0; i < auctions.MAX_PER_SELLER; i++) {
    auctions.addAuction(s, 'Alice', item({ id: 'i' + i, name: 'Item ' + i }), 10, 24, Date.now());
  }
  const r = auctions.canList(s, 'Alice', item({ id: 'overcap' }), 10, 24);
  check('canList rejects when seller hits cap', !r.ok);
  // Different seller still works
  check('canList ok for different seller after cap',
    auctions.canList(s, 'Bob', item({ id: 'bob1' }), 10, 24).ok);
}

// === addAuction + getAuction + ID format ===
{
  const s = auctions.emptyState();
  const a1 = auctions.addAuction(s, 'Alice', item(), 100, 24, 1_000_000);
  const a2 = auctions.addAuction(s, 'Bob', item({ id: 'torch' }), 50, 12, 1_000_000);
  check('addAuction returns auction with id', a1 && /^auc_/.test(a1.id));
  check('addAuction increments nextSeq', s.nextSeq === 3);
  check('getAuction finds by id', auctions.getAuction(s, a1.id) === a1);
  check('expiresAt computed from durationHrs', a1.expiresAt === 1_000_000 + 24 * 3600 * 1000);
  check('two auctions with distinct ids', a1.id !== a2.id);
}

// === canBid: scenarios ===
{
  const s = auctions.emptyState();
  const a = auctions.addAuction(s, 'Alice', item(), 100, 24, Date.now());
  // Self-bid rejected
  check('canBid rejects self-bid',
    !auctions.canBid(s, a.id, 'Alice', 200, Date.now()).ok);
  // Below starting bid rejected
  check('canBid rejects bid under starting',
    !auctions.canBid(s, a.id, 'Bob', 50, Date.now()).ok);
  // Meets starting bid
  const ok1 = auctions.canBid(s, a.id, 'Bob', 100, Date.now());
  check('canBid ok at starting bid', ok1.ok && ok1.amount === 100);
  // Apply, then test increment
  auctions.applyBid(s, a.id, 'Bob', 100);
  // Min increment: 5% of 100 = 5; new bid must be >=105
  check('canBid rejects increment under threshold',
    !auctions.canBid(s, a.id, 'Carol', 102, Date.now()).ok);
  check('canBid ok at min increment',
    auctions.canBid(s, a.id, 'Carol', 105, Date.now()).ok);
  // Carol takes top, prevBidder reflected
  auctions.applyBid(s, a.id, 'Carol', 105);
  const r = auctions.canBid(s, a.id, 'Dave', 200, Date.now());
  check('canBid surfaces prevBidder + prevBid', r.ok && r.prevBidder === 'Carol' && r.prevBid === 105);
  // Expired auction
  const expired = auctions.addAuction(s, 'X', item(), 50, 1, Date.now() - 3 * 3600 * 1000);
  check('canBid rejects expired auction',
    !auctions.canBid(s, expired.id, 'Bob', 100, Date.now()).ok);
  // Non-existent
  check('canBid rejects unknown id',
    !auctions.canBid(s, 'auc_zzzz', 'Bob', 100, Date.now()).ok);
  // Negative amount
  check('canBid rejects non-positive amount',
    !auctions.canBid(s, a.id, 'Eve', -5, Date.now()).ok);
}

// === Min-increment math: ensure +1g floor for cheap auctions ===
{
  const s = auctions.emptyState();
  const a = auctions.addAuction(s, 'Alice', item(), 5, 24, Date.now());
  auctions.applyBid(s, a.id, 'Bob', 5);
  // 5% of 5 = 0.25 -> ceil = 1; floor MIN_INCREMENT_GOLD also 1; so min next = 6
  check('min-increment floor is 1g for cheap bids',
    !auctions.canBid(s, a.id, 'Carol', 5, Date.now()).ok &&
     auctions.canBid(s, a.id, 'Carol', 6, Date.now()).ok);
}

// === canCancel ===
{
  const s = auctions.emptyState();
  const a = auctions.addAuction(s, 'Alice', item(), 100, 24, Date.now());
  auctions.applyBid(s, a.id, 'Bob', 100);
  const r = auctions.canCancel(s, a.id, 'Alice');
  check('canCancel ok for seller', r.ok && r.refundBidder === 'Bob' && r.refundAmount === 100);
  check('canCancel rejects non-seller',
    !auctions.canCancel(s, a.id, 'Mallory').ok);
  check('canCancel rejects unknown id',
    !auctions.canCancel(s, 'auc_zzzz', 'Alice').ok);
}

// === findExpired + moveToHistory ===
{
  const s = auctions.emptyState();
  const a1 = auctions.addAuction(s, 'A', item(), 100, 24, Date.now());
  const a2 = auctions.addAuction(s, 'B', item(), 50, 1, Date.now() - 3 * 3600 * 1000);
  const expired = auctions.findExpired(s, Date.now());
  check('findExpired finds the expired one', expired.length === 1 && expired[0].id === a2.id);
  auctions.applyBid(s, a2.id, 'C', 60);
  const fee = auctions.moveToHistory(s, a2, 'sold', Date.now());
  check('moveToHistory computes fee on sold', fee === Math.floor(60 * auctions.HOUSE_FEE_PCT));
  check('moveToHistory unshifts onto history',
    s.history.length === 1 && s.history[0].outcome === 'sold' && s.history[0].finalBid === 60);
}

// === removeAuction returns the removed entry ===
{
  const s = auctions.emptyState();
  const a = auctions.addAuction(s, 'A', item(), 100, 24, Date.now());
  const removed = auctions.removeAuction(s, a.id);
  check('removeAuction returns auction', removed && removed.id === a.id);
  check('removeAuction empties active list', s.active.length === 0);
  check('removeAuction returns null on unknown id', auctions.removeAuction(s, 'nope') === null);
}

// === pending claim queue ===
{
  const s = auctions.emptyState();
  const a = auctions.addAuction(s, 'A', item(), 100, 24, Date.now());
  auctions.addPending(s, 'Bob', a);
  check('addPending puts entry into pending', s.pending.length === 1 && s.pending[0].winner === 'Bob');
  check('listPendingFor case-insensitive', auctions.listPendingFor(s, 'BOB').length === 1);
  const claim = auctions.takePending(s, 'Bob', a.id);
  check('takePending returns + removes', claim && claim.id === a.id && s.pending.length === 0);
  check('takePending null when nothing pending', auctions.takePending(s, 'Bob') === null);
}

// === MAX_TOTAL_ACTIVE cap ===
{
  const s = auctions.emptyState();
  for (let i = 0; i < auctions.MAX_TOTAL_ACTIVE; i++) {
    auctions.addAuction(s, 'seller_' + i, item({ id: 'x' + i }), 10, 24, Date.now());
  }
  const r = auctions.canList(s, 'NewSeller', item(), 10, 24);
  check('canList rejects when total cap hit', !r.ok);
}

// === formatRemaining ===
{
  check('formatRemaining handles seconds', /^\d+s$/.test(auctions.formatRemaining(30 * 1000)));
  check('formatRemaining handles minutes', /m \d+s$/.test(auctions.formatRemaining(125 * 1000)));
  check('formatRemaining handles hours', /h \d+m$/.test(auctions.formatRemaining(2 * 3600 * 1000)));
  check('formatRemaining "expired" for non-positive', auctions.formatRemaining(0) === 'expired' && auctions.formatRemaining(-5) === 'expired');
}

// === loadState / saveState round-trip ===
{
  const tmpDir = path.join(__dirname, '_test_auctions_tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
  const tmpFile = path.join(tmpDir, 'auctions.json');
  // empty load returns fresh state
  const fresh = auctions.loadState(tmpFile);
  check('loadState on missing file returns empty', fresh.active.length === 0);
  // Build state, save, reload
  const s = auctions.emptyState();
  auctions.addAuction(s, 'Alice', item(), 100, 24, Date.now());
  const sr = auctions.saveState(s, tmpFile);
  check('saveState reports ok', sr.ok);
  check('saveState wrote target', fs.existsSync(tmpFile));
  const reloaded = auctions.loadState(tmpFile);
  check('loadState round-trips active list', reloaded.active.length === 1 && reloaded.active[0].seller === 'Alice');
  check('loadState round-trips nextSeq', reloaded.nextSeq === s.nextSeq);
  // Atomic write produced .bak after second save
  auctions.saveState(s, tmpFile);
  check('saveState rotates .bak on second save', fs.existsSync(tmpFile + '.bak'));
  // Cleanup
  try { fs.unlinkSync(tmpFile); } catch (e) {}
  try { fs.unlinkSync(tmpFile + '.bak'); } catch (e) {}
  try { fs.unlinkSync(tmpFile + '.tmp'); } catch (e) {}
  try { fs.rmdirSync(tmpDir); } catch (e) {}
}

// === loadState resilient to garbage file ===
{
  const tmpFile = path.join(__dirname, '_test_garbage_auctions.json');
  fs.writeFileSync(tmpFile, '{not json', 'utf8');
  const s = auctions.loadState(tmpFile);
  check('loadState returns empty state on parse failure', s.active.length === 0 && s.nextSeq === 1);
  try { fs.unlinkSync(tmpFile); } catch (e) {}
}

// === Server-side wiring checks ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('auctions module imported', /require\('\.\/world\/auctions'\)/.test(src));
  check('auctionState declared', /let auctionState\b/.test(src));
  check('reaper interval set up', /AUCTION_REAPER_INTERVAL_MS/.test(src) && /setInterval\(runAuctionReaper/.test(src));
  check('handleAuction defined', /function handleAuction\s*\(/.test(src));
  check('auction routed in command dispatcher', /command === 'auction' \|\| command\.startsWith\('auction '\)/.test(src));
  check('ah alias routed', /command === 'ah' \|\| command\.startsWith\('ah '\)/.test(src));
  check('sell escrows item from inventory', /handleAuction[\s\S]+?player\.inventory\.splice/.test(src));
  check('bid escrows gold from bidder', /handleAuction[\s\S]+?player\.gold -= validation\.amount/.test(src));
  check('bid refunds previous top bidder', /handleAuction[\s\S]+?payOfflineGold\(validation\.prevBidder/.test(src));
  check('cancel refunds top bidder', /handleAuction[\s\S]+?canCancel[\s\S]+?payOfflineGold\(validation\.refundBidder/.test(src));
  check('settleAuction defined', /function settleAuction\s*\(/.test(src));
  check('settleAuction routes unsold to seller', /unsold[\s\S]+?deliverOfflineItem\(auction\.seller/.test(src));
  check('login flushes auctionMail', /auctionMail[\s\S]+?for \(const m of player\.auctionMail/.test(src));
  check('login warns on pending claims', /listPendingFor\(auctionState, player\.name\)[\s\S]+?claim queue/.test(src));
  check('persistAuctions called after sell/bid/cancel/claim',
    (src.match(/persistAuctions\(\)/g) || []).length >= 4);
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
