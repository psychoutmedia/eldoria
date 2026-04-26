// Tier 4.2: Auction House.
//
// Pure data layer: tracks auctions in memory and persists to auctions.json.
// All gold/inventory mutation lives in mud_server.js — this module just
// answers questions ("can this player bid?", "is this auction expired?")
// and stores the resulting state.
//
// State shape:
//   { active:  [auction], pending: [pendingClaim], history: [historyEntry], nextSeq: int }

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'auctions.json');
const STORE_BAK  = STORE_PATH + '.bak';
const STORE_TMP  = STORE_PATH + '.tmp';

// === Tunables ===
const HOUSE_FEE_PCT          = 0.05;     // 5% off the winning bid
const MIN_INCREMENT_PCT      = 0.05;     // bid must beat current by this fraction
const MIN_INCREMENT_GOLD     = 1;        // ...or this much gold, whichever is greater
const DEFAULT_DURATION_HRS   = 24;
const MAX_DURATION_HRS       = 72;
const MIN_DURATION_HRS       = 1;
const MAX_PER_SELLER         = 5;
const MAX_TOTAL_ACTIVE       = 100;
const MIN_STARTING_BID       = 1;

function emptyState() {
  return { active: [], pending: [], history: [], nextSeq: 1 };
}

function loadState(filePath = STORE_PATH) {
  if (!fs.existsSync(filePath)) return emptyState();
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      active:  Array.isArray(data.active)  ? data.active  : [],
      pending: Array.isArray(data.pending) ? data.pending : [],
      history: Array.isArray(data.history) ? data.history : [],
      nextSeq: Number.isInteger(data.nextSeq) ? data.nextSeq : 1
    };
  } catch (e) {
    return emptyState();
  }
}

function saveState(state, filePath = STORE_PATH) {
  try {
    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, filePath + '.bak'); } catch (e) {}
    }
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function nextId(state) {
  const n = state.nextSeq || 1;
  state.nextSeq = n + 1;
  return `auc_${n.toString(36).padStart(4, '0')}`;
}

// === Validation: list a new auction ===
//
// Caller has already verified `seller` owns the item; we only check house rules.
function canList(state, sellerName, item, startingBid, durationHrs) {
  if (!sellerName) return { ok: false, error: 'No seller.' };
  if (!item || !item.name) return { ok: false, error: 'Invalid item.' };
  const bid = parseInt(startingBid, 10);
  if (!Number.isFinite(bid) || bid < MIN_STARTING_BID) {
    return { ok: false, error: `Starting bid must be at least ${MIN_STARTING_BID} gold.` };
  }
  const dur = durationHrs == null ? DEFAULT_DURATION_HRS : parseFloat(durationHrs);
  if (!Number.isFinite(dur) || dur < MIN_DURATION_HRS || dur > MAX_DURATION_HRS) {
    return { ok: false, error: `Duration must be ${MIN_DURATION_HRS}-${MAX_DURATION_HRS} hours.` };
  }
  if (state.active.length >= MAX_TOTAL_ACTIVE) {
    return { ok: false, error: 'The auction house is full. Try again later.' };
  }
  const sellerCount = state.active.filter(a => a.seller.toLowerCase() === sellerName.toLowerCase()).length;
  if (sellerCount >= MAX_PER_SELLER) {
    return { ok: false, error: `You already have ${MAX_PER_SELLER} active listings.` };
  }
  return { ok: true, startingBid: bid, durationHrs: dur };
}

// Add an auction. Caller has already escrowed the item (removed it from seller).
function addAuction(state, sellerName, item, startingBid, durationHrs, now) {
  const id = nextId(state);
  const expiresAt = now + Math.round(durationHrs * 3600 * 1000);
  const auction = {
    id,
    seller: sellerName,
    item,
    startingBid: parseInt(startingBid, 10),
    currentBid: null,
    topBidder: null,
    listedAt: now,
    expiresAt
  };
  state.active.push(auction);
  return auction;
}

function getAuction(state, auctionId) {
  return state.active.find(a => a.id === auctionId) || null;
}

// === Validation: place a bid ===
function canBid(state, auctionId, bidderName, amount, now) {
  const auction = getAuction(state, auctionId);
  if (!auction) return { ok: false, error: 'No such active auction.' };
  if (auction.expiresAt <= now) return { ok: false, error: 'That auction has already expired.' };
  if (auction.seller.toLowerCase() === (bidderName || '').toLowerCase()) {
    return { ok: false, error: 'You cannot bid on your own auction.' };
  }
  const amt = parseInt(amount, 10);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: 'Bid amount must be a positive integer.' };
  }
  // First bid: must meet starting bid
  if (auction.currentBid == null) {
    if (amt < auction.startingBid) {
      return { ok: false, error: `Minimum opening bid is ${auction.startingBid} gold.` };
    }
  } else {
    const minNext = auction.currentBid + Math.max(
      MIN_INCREMENT_GOLD,
      Math.ceil(auction.currentBid * MIN_INCREMENT_PCT)
    );
    if (amt < minNext) {
      return { ok: false, error: `Minimum next bid is ${minNext} gold.` };
    }
  }
  return { ok: true, auction, amount: amt, prevBidder: auction.topBidder, prevBid: auction.currentBid };
}

// Apply a bid. Caller has already escrowed bidder gold + refunded prev bidder.
function applyBid(state, auctionId, bidderName, amount) {
  const auction = getAuction(state, auctionId);
  if (!auction) return null;
  auction.currentBid = parseInt(amount, 10);
  auction.topBidder = bidderName;
  return auction;
}

// === Validation: cancel ===
function canCancel(state, auctionId, sellerName) {
  const auction = getAuction(state, auctionId);
  if (!auction) return { ok: false, error: 'No such active auction.' };
  if (auction.seller.toLowerCase() !== (sellerName || '').toLowerCase()) {
    return { ok: false, error: 'You did not list that auction.' };
  }
  return {
    ok: true,
    auction,
    refundBidder: auction.topBidder,
    refundAmount: auction.currentBid
  };
}

// Remove an auction. Caller is responsible for moving it to history with the
// right outcome (cancelled / unsold / sold) and for any payouts.
function removeAuction(state, auctionId) {
  const idx = state.active.findIndex(a => a.id === auctionId);
  if (idx === -1) return null;
  const [removed] = state.active.splice(idx, 1);
  return removed;
}

function findExpired(state, now) {
  return state.active.filter(a => a.expiresAt <= now);
}

function moveToHistory(state, auction, outcome, settledAt) {
  const fee = (outcome === 'sold' && auction.currentBid)
    ? Math.floor(auction.currentBid * HOUSE_FEE_PCT)
    : 0;
  state.history.unshift({
    id: auction.id,
    seller: auction.seller,
    winner: auction.topBidder,
    item: auction.item,
    finalBid: auction.currentBid,
    fee,
    outcome,
    listedAt: auction.listedAt,
    settledAt: settledAt || Date.now()
  });
  // Cap history at 200 entries to keep the file small
  if (state.history.length > 200) state.history.length = 200;
  return fee;
}

// Add to pending claim queue (winner inventory was full at settle time).
function addPending(state, winnerName, auction) {
  state.pending.push({
    id: auction.id,
    winner: winnerName,
    item: auction.item,
    pendingSince: Date.now()
  });
}

// Pull a pending claim for a player. Returns the claim or null.
function takePending(state, winnerName, auctionId) {
  const idx = state.pending.findIndex(
    p => p.winner.toLowerCase() === (winnerName || '').toLowerCase()
      && (auctionId == null || p.id === auctionId)
  );
  if (idx === -1) return null;
  const [claim] = state.pending.splice(idx, 1);
  return claim;
}

function listPendingFor(state, winnerName) {
  const lower = (winnerName || '').toLowerCase();
  return state.pending.filter(p => p.winner.toLowerCase() === lower);
}

function listActive(state) {
  return state.active.slice().sort((a, b) => a.expiresAt - b.expiresAt);
}

function listActiveFor(state, sellerName) {
  const lower = (sellerName || '').toLowerCase();
  return state.active.filter(a => a.seller.toLowerCase() === lower);
}

function listHistoryFor(state, name, limit = 20) {
  const lower = (name || '').toLowerCase();
  return state.history
    .filter(h => h.seller.toLowerCase() === lower || (h.winner && h.winner.toLowerCase() === lower))
    .slice(0, limit);
}

// Format a duration in ms as compact "1h 23m" / "5m 12s".
function formatRemaining(ms) {
  if (ms <= 0) return 'expired';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Test hook
function _resetForTests(state) {
  state.active.length = 0;
  state.pending.length = 0;
  state.history.length = 0;
  state.nextSeq = 1;
}

module.exports = {
  // Constants
  HOUSE_FEE_PCT, MIN_INCREMENT_PCT, MIN_INCREMENT_GOLD,
  DEFAULT_DURATION_HRS, MAX_DURATION_HRS, MIN_DURATION_HRS,
  MAX_PER_SELLER, MAX_TOTAL_ACTIVE, MIN_STARTING_BID,
  STORE_PATH,
  // State lifecycle
  emptyState, loadState, saveState,
  // Listing
  canList, addAuction, getAuction,
  // Bidding
  canBid, applyBid,
  // Cancel/expire
  canCancel, removeAuction, findExpired, moveToHistory,
  // Pending claim queue
  addPending, takePending, listPendingFor,
  // Queries
  listActive, listActiveFor, listHistoryFor,
  // Formatting
  formatRemaining,
  // Test hook
  _resetForTests
};
