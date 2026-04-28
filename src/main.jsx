import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabaseClient";
import "../styles.css";

const initialMarkets = [];

const initialCommunities = [
  { name: "Townhouse 4B", type: "Private", members: 18, pnl: 1180, seasonPot: 5400, logoKind: "emoji", logoValue: "🏠" },
  { name: "Campus After Dark", type: "Public", members: 1240, pnl: 420, seasonPot: 21800, logoKind: "emoji", logoValue: "🌙" },
  { name: "Sunday Group Chat", type: "Private", members: 12, pnl: -90, seasonPot: 1600, logoKind: "emoji", logoValue: "💬" },
];

const friends = [
  { name: "Maya", initials: "MA", color: "green", line: "Sent a countercall on Brunch Treaty" },
  { name: "Theo", initials: "TH", color: "blue", line: "Up 380 this season" },
  { name: "Ari", initials: "AR", color: "gold", line: "Flagged you as rival" },
];

const leaderboard = [
  { name: "Maya", initials: "MA", color: "green", pnl: 1380, record: "19-7" },
  { name: "Luca", initials: "LU", color: "violet", pnl: 642, record: "38-21" },
  { name: "Theo", initials: "TH", color: "blue", pnl: 381, record: "11-9" },
  { name: "Ari", initials: "AR", color: "gold", pnl: -74, record: "8-12" },
];

const profile = {
  name: "Lucas Maass",
  handle: "@lucasmaass",
  initials: "LM",
  record: "38-21",
  winRate: 64,
  pnl: 642,
  rival: "Maya",
};

const nav = [
  ["markets", "For You", ""],
  ["groups", "Friends", ""],
  ["profile", "Public", ""],
  ["dm", "DMs", ""],
  ["shop", "Shop", ""],
];

const TRADE_CREDITS = 100;
const MIN_TRADE_AMOUNT = 50;
const MARKET_SEED_POOL = 100;
const MIN_SEED_POOL = 100;
const POOL_FEE_RATE = 0.03;
const INFINITE_CREDITS = 999999999;
const DAILY_CLAIM_AMOUNT = 1000;
const DAILY_CLAIM_MS = 24 * 60 * 60 * 1000;
const VOTE_WINDOW_MS = 60 * 60 * 1000;

function currency(value) {
  if (value >= INFINITE_CREDITS) return "∞";
  return value.toLocaleString();
}

function usd(value) {
  if (value >= INFINITE_CREDITS) return "unlimited";
  return `$${(value / 100).toFixed(2)}`;
}

function marketProbability(yesPool = 0, noPool = 0) {
  const totalPool = yesPool + noPool;
  if (totalPool <= 0) return 50;
  return Math.round((yesPool / totalPool) * 100);
}

function seededPools(startingYes, seedPool = MARKET_SEED_POOL) {
  const yesPercent = Math.min(95, Math.max(5, Number(startingYes) || 50));
  const yesPool = Math.round(seedPool * (yesPercent / 100));
  return {
    yesPool,
    noPool: seedPool - yesPool,
  };
}

function estimatePoolPayout(market, side, amount) {
  const tradeAmount = Math.max(0, Number(amount) || 0);
  const yesPool = market.yesPool ?? Math.round((market.volume * market.yes) / 100);
  const noPool = market.noPool ?? market.volume - yesPool;
  const winnerPool = side === "yes" ? yesPool + tradeAmount : noPool + tradeAmount;
  const totalPool = yesPool + noPool + tradeAmount;
  if (winnerPool <= 0) return 0;
  return Math.round((tradeAmount / winnerPool) * totalPool * (1 - POOL_FEE_RATE));
}

function buyWithPool(market, side, amount = TRADE_CREDITS) {
  const yesPool = market.yesPool ?? Math.round((market.volume * market.yes) / 100);
  const noPool = market.noPool ?? market.volume - yesPool;
  const nextYesPool = side === "yes" ? yesPool + amount : yesPool;
  const nextNoPool = side === "no" ? noPool + amount : noPool;
  const nextYesPrice = marketProbability(nextYesPool, nextNoPool);

  return {
    ...market,
    yesPool: nextYesPool,
    noPool: nextNoPool,
    yes: nextYesPrice,
    history: [...(market.history ?? [market.yes]), nextYesPrice].slice(-12),
    volume: market.volume + amount,
  };
}

function parseCloseDate(value) {
  if (!value || value === "TBD") return null;

  const numericDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numericDate) {
    const [, month, day, year] = numericDate;
    return new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59);
  }

  const textDate = new Date(`${value}, ${new Date().getFullYear()} 23:59:59`);
  if (Number.isNaN(textDate.getTime())) return null;
  if (textDate < new Date()) textDate.setFullYear(textDate.getFullYear() + 1);
  return textDate;
}

function votingState(market, now = Date.now()) {
  if (market.status === "Resolved" || market.resolver !== "Vote") return "none";
  const closeDate = parseCloseDate(market.closes);
  if (!closeDate) return "none";
  const closeTime = closeDate.getTime();
  if (now < closeTime) return "waiting";
  if (now <= closeTime + VOTE_WINDOW_MS) return "open";
  return "ended";
}

function voteWindowLabel(market, now = Date.now()) {
  const closeDate = parseCloseDate(market.closes);
  if (!closeDate) return "";
  const endTime = closeDate.getTime() + VOTE_WINDOW_MS;
  const diffMs = endTime - now;
  if (diffMs <= 0) return "Voting ended";
  const minutes = Math.ceil(diffMs / 60000);
  return `${minutes}m left to vote`;
}

function timeLeftLabel(closes, now = Date.now()) {
  const closeDate = parseCloseDate(closes);
  if (!closeDate) return "No close";

  const diffMs = closeDate.getTime() - now;
  if (diffMs <= 0) return "Ended";

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  if (minutes > 0) return `${minutes}m left`;
  return `${seconds}s left`;
}

function claimCountdownLabel(lastClaimAt, now = Date.now()) {
  if (!lastClaimAt) return "";
  const lastClaimTime = new Date(lastClaimAt).getTime();
  if (Number.isNaN(lastClaimTime)) return "";
  const remaining = lastClaimTime + DAILY_CLAIM_MS - now;
  if (remaining <= 0) return "";
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function canClaimCredits(lastClaimAt, now = Date.now()) {
  if (!lastClaimAt) return true;
  const lastClaimTime = new Date(lastClaimAt).getTime();
  if (Number.isNaN(lastClaimTime)) return true;
  return now - lastClaimTime >= DAILY_CLAIM_MS;
}

function formatAxisDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function axisDates(createdAt, now = new Date()) {
  const start = createdAt ? new Date(`${createdAt}T00:00:00`) : now;
  const midpoint = new Date((start.getTime() + now.getTime()) / 2);
  return {
    start: formatAxisDate(start),
    mid: formatAxisDate(midpoint),
    end: formatAxisDate(now),
  };
}

function profileFromUser(user) {
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Chalk user";
  const handleBase = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) || "chalkuser";
  return {
    id: user.id,
    handle: `${handleBase}${user.id.slice(0, 4)}`,
    display_name: displayName,
    email: user.email,
    credits: 0,
    last_credit_claim_at: null,
  };
}

function friendFromProfile(row) {
  const displayName = row.display_name || row.email?.split("@")[0] || "Chalk friend";
  return {
    id: row.id,
    name: displayName,
    email: row.email,
    handle: row.handle,
    initials: displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    color: "violet",
    line: row.handle ? `@${row.handle}` : row.email || "Chalk account",
  };
}

function appStatus(status) {
  const labels = {
    pending_approval: "Pending approval",
    live: "Live",
    closed: "Closed",
    resolved: "Resolved",
    disputed: "Disputed",
  };
  return labels[status] || "Live";
}

function dbStatus(status) {
  const labels = {
    "Pending approval": "pending_approval",
    Live: "live",
    Closed: "closed",
    Resolved: "resolved",
    Disputed: "disputed",
  };
  return labels[status] || "live";
}

function dbResolver(resolver) {
  const labels = {
    Vote: "community_vote",
    Creator: "creator",
    "Third party": "third_party",
  };
  return labels[resolver] || "community_vote";
}

function dbCommunityType(type) {
  return type?.toLowerCase() === "public" ? "public" : "private";
}

function appResolver(resolver) {
  const labels = {
    community_vote: "Vote",
    creator: "Creator",
    third_party: "Third party",
    app_approved: "App approved",
  };
  return labels[resolver] || "Vote";
}

function marketFromRow(row) {
  const yesPool = row.yes_pool ?? Math.round(((row.volume ?? 0) * (row.yes_price ?? 50)) / 100);
  const noPool = row.no_pool ?? Math.max(0, (row.volume ?? 0) - yesPool);
  return {
    id: row.id,
    title: row.title,
    description: row.description || "Created from Chalk.",
    community: row.community_name || (row.community_id ? "Community" : "No community"),
    communityId: row.community_id,
    privacy: row.community_id ? "Private" : "Public",
    resolver: appResolver(row.resolver_mode),
    closes: row.close_at ? formatDateInput(new Date(row.close_at)) : "TBD",
    status: appStatus(row.status),
    outcome: row.outcome,
    yesPool,
    noPool,
    yes: marketProbability(yesPool, noPool),
    seedPool: row.seed_pool ?? yesPool + noPool,
    volume: row.volume ?? yesPool + noPool,
    traders: row.traders ?? 0,
    history: row.history?.length ? row.history : [marketProbability(yesPool, noPool)],
    createdAt: row.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    creator: row.creator_name || "Chalk user",
    creatorId: row.creator_id,
    thirdPartyResolverId: row.third_party_resolver_id,
    thirdPartyResolverName: row.third_party_resolver_name,
  };
}

function communityFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type === "public" ? "Public" : "Private",
    members: row.members ?? 1,
    pnl: row.pnl ?? 0,
    seasonPot: row.season_pot ?? 0,
    logoKind: row.logo_kind || "emoji",
    logoValue: row.logo_value || "🏠",
  };
}

function positionFromRow(row) {
  return {
    id: row.id,
    marketId: row.market_id,
    title: row.title_snapshot,
    community: row.community_snapshot,
    side: row.side,
    amount: row.amount,
    entryPrice: row.average_price,
    payout: row.payout,
    status: appStatus(row.status),
    outcome: row.outcome,
    finalPayout: row.final_payout,
    profit: row.profit,
  };
}

function formatDateInput(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

function Avatar({ person, initials, color = "violet" }) {
  return <div className={`avatar ${color}`}>{initials || person?.initials}</div>;
}

function CommunityLogo({ community, large = false }) {
  const className = `community-logo${large ? " large" : ""}`;
  if (community.logoKind === "image" && community.logoValue) {
    return <span className={className}><img src={community.logoValue} alt="" /></span>;
  }
  return <span className={className}>{community.logoValue || "🏠"}</span>;
}

function Pill({ children, tone = "" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function MarketCard({ market, currentUserId, voteCounts = {}, onBuy, onResolve, onVote }) {
  const [ticket, setTicket] = useState(null);
  const [amount, setAmount] = useState(String(TRADE_CREDITS));
  const [ticketError, setTicketError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [chartOpen, setChartOpen] = useState(false);
  const no = 100 - market.yes;
  const yesPool = market.yesPool ?? Math.round((market.volume * market.yes) / 100);
  const noPool = market.noPool ?? market.volume - yesPool;
  const statusTone = market.status === "Disputed" ? "bad" : market.status === "Pending approval" ? "hot" : "good";
  const activePrice = ticket === "yes" ? market.yes : no;
  const numericAmount = Number(amount) || 0;
  const estimatedPayout = ticket ? estimatePoolPayout(market, ticket, numericAmount) : 0;
  const sparkPoints = (market.history ?? [market.yes]).map((point) => Math.max(1, Math.min(99, point)));
  const sparkPath = sparkPoints
    .map((point, index) => {
      const x = sparkPoints.length === 1 ? 60 : 4 + (index * 112) / (sparkPoints.length - 1);
      return `${index === 0 ? "M" : "L"} ${x} ${60 - point * 0.55}`;
    })
    .join(" ");
  const sparkTone = market.yes > 50 ? "up" : market.yes < 50 ? "down" : "even";
  const sparkDates = axisDates(market.createdAt, new Date(now));
  const voteState = votingState(market, now);
  const votes = voteCounts[market.id] || { yes: 0, no: 0, myVote: null };
  const canCreatorResolve = market.resolver === "Creator" && market.creatorId === currentUserId;
  const canThirdPartyResolve = market.resolver === "Third party" && market.thirdPartyResolverId === currentUserId;
  const canResolve = canCreatorResolve || canThirdPartyResolve;
  const cannotBetReason =
    market.thirdPartyResolverId === currentUserId
      ? "You are the third-party resolver for this market."
      : "";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function openTicket(side) {
    if (market.status === "Resolved") return;
    if (cannotBetReason) {
      setTicketError(cannotBetReason);
      return;
    }
    setTicket((current) => (current === side ? null : side));
    setAmount(String(TRADE_CREDITS));
    setTicketError("");
  }

  function updateAmount(value) {
    setTicketError("");
    if (value === "") {
      setAmount("");
      return;
    }
    const nextAmount = Number(value);
    if (Number.isNaN(nextAmount)) return;
    setAmount(String(Math.min(5000, Math.max(0, nextAmount))));
  }

  async function submitTrade() {
    if (!ticket) return;
    if (cannotBetReason) {
      setTicketError(cannotBetReason);
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_TRADE_AMOUNT) {
      setTicketError("Minimum bet is 50.");
      return;
    }
    if (estimatedPayout < numericAmount) {
      setTicketError("Payout must be at least your bet.");
      return;
    }
    const placed = await onBuy(market.id, ticket, numericAmount);
    if (!placed) return;
    setTicket(null);
    setTicketError("");
  }

  return (
    <article className="market-card">
      <div className="market-top">
        <div className="market-community">
          <div className="community-icon">{market.privacy === "Public" ? "🏀" : "🏠"}</div>
          <div>
            <strong>{market.community}</strong>
            <span>{market.privacy.toLowerCase()} · by {market.creator}</span>
          </div>
        </div>
        <span className="time-left">◷ {timeLeftLabel(market.closes, now)}</span>
      </div>
      <p className="question-kicker">{market.id % 2 ? "💋" : "🏀"}</p>
      <h3>{market.title}</h3>
      <div className="odds-line">
        <div>
          <strong className="big-price">{market.yes}%</strong>
          <p>{market.traders ?? 0} traders · {market.volume.toLocaleString()} volume</p>
        </div>
        <button className="spark-button" type="button" aria-label="Expand chart" onClick={() => setChartOpen(true)}>
          <svg className={`sparkline ${sparkTone}`} viewBox="0 0 120 60" aria-hidden="true">
            <text className="axis-label percent-label" x="8" y="12">%</text>
            <text className="axis-label" x="4" y="58">{sparkDates.start}</text>
            <text className="axis-label" x="48" y="58">{sparkDates.mid}</text>
            <text className="axis-label" x="94" y="58">{sparkDates.end}</text>
            <path d={sparkPath} />
          </svg>
        </button>
      </div>
      <div className="bar feed-bar">
        <span style={{ width: `${market.yes}%` }} />
      </div>
      <div className="trade-controls">
        <button disabled={market.status === "Resolved" || Boolean(cannotBetReason)} className={`trade-button ${market.yes === 50 ? "even" : ""} ${ticket === "yes" ? "active yes" : ""}`} onClick={() => openTicket("yes")}>
          YES&nbsp; {market.yes}%
        </button>
        <button disabled={market.status === "Resolved" || Boolean(cannotBetReason)} className={`trade-button ${market.yes === 50 ? "even" : ""} ${ticket === "no" ? "active no" : ""}`} onClick={() => openTicket("no")}>
          NO&nbsp; {no}%
        </button>
      </div>
      {cannotBetReason && <p className="market-note">{cannotBetReason}</p>}
      <div className="pool-breakdown">
        <div>
          <span>YES Pool</span>
          <strong>{yesPool.toLocaleString()}</strong>
        </div>
        <div>
          <span>NO Pool</span>
          <strong>{noPool.toLocaleString()}</strong>
        </div>
      </div>
      {ticket && (
        <div className="trade-ticket">
          <div className="ticket-head">
            <span>{ticket.toUpperCase()} order</span>
            <input
              aria-label="Trade amount"
              type="number"
              min={MIN_TRADE_AMOUNT}
              max="5000"
              value={amount}
              onChange={(event) => updateAmount(event.target.value)}
            />
          </div>
          <input
            aria-label="Trade volume"
              type="range"
              min={MIN_TRADE_AMOUNT}
              max="5000"
              step="25"
            value={Math.max(MIN_TRADE_AMOUNT, numericAmount || MIN_TRADE_AMOUNT)}
            onChange={(event) => updateAmount(event.target.value)}
          />
          <div className="ticket-foot">
            <div>
              <span>Est. payout: {estimatedPayout.toLocaleString()}</span>
              {ticketError && <span className="ticket-error">{ticketError}</span>}
            </div>
            <button className="primary" onClick={submitTrade}>Confirm</button>
          </div>
        </div>
      )}
      <div className="market-footer">
        <div>
          <span>Volume</span>
          <strong>{currency(market.volume)}</strong>
        </div>
        <div>
          <span>Traders</span>
          <strong>{market.traders ?? 0}</strong>
        </div>
        <div>
          <span>Closes</span>
          <strong>{market.closes}</strong>
        </div>
      </div>
      <div className="resolve-controls">
        {market.status === "Resolved" ? (
          <span>Resolved {market.outcome?.toUpperCase()}</span>
        ) : voteState === "open" ? (
          <div className="vote-box">
            <span>{voteWindowLabel(market, now)}</span>
            <div>
              <button type="button" className={votes.myVote === "yes" ? "active" : ""} onClick={() => onVote(market.id, "yes")}>
                Vote YES ({votes.yes})
              </button>
              <button type="button" className={votes.myVote === "no" ? "active" : ""} onClick={() => onVote(market.id, "no")}>
                Vote NO ({votes.no})
              </button>
            </div>
          </div>
        ) : voteState === "waiting" ? (
          <span>Vote opens when market closes</span>
        ) : market.resolver === "Vote" ? (
          <span>Vote finalizing</span>
        ) : canResolve ? (
          <>
            <button type="button" onClick={() => onResolve(market.id, "yes")}>Resolve YES</button>
            <button type="button" onClick={() => onResolve(market.id, "no")}>Resolve NO</button>
          </>
        ) : (
          <span>
            {market.resolver === "Third party"
              ? `${market.thirdPartyResolverName || "Third party"} resolves`
              : "Only creator can resolve"}
          </span>
        )}
      </div>
      {chartOpen && (
        <div className="chart-modal-backdrop" onClick={(event) => event.target === event.currentTarget && setChartOpen(false)}>
          <div className="chart-modal">
            <button className="chart-close" type="button" aria-label="Close chart" onClick={() => setChartOpen(false)}>×</button>
            <div>
              <span className="eyebrow">YES probability</span>
              <h3>{market.title}</h3>
            </div>
            <svg className={`sparkline expanded ${sparkTone}`} viewBox="0 0 120 60" aria-hidden="true">
              <text className="axis-label percent-label" x="8" y="12">%</text>
              <text className="axis-label" x="4" y="58">{sparkDates.start}</text>
              <text className="axis-label" x="48" y="58">{sparkDates.mid}</text>
              <text className="axis-label" x="94" y="58">{sparkDates.end}</text>
              <path d={sparkPath} />
            </svg>
          </div>
        </div>
      )}
    </article>
  );
}

function MarketModal({ communities, friendsList, onClose, onCreate }) {
  const [resolver, setResolver] = useState("Community vote");
  const [dateValue, setDateValue] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [startingYes, setStartingYes] = useState(50);
  const [seedPool, setSeedPool] = useState(String(MARKET_SEED_POOL));
  const [sendToFriendId, setSendToFriendId] = useState("");
  const [thirdPartyResolverId, setThirdPartyResolverId] = useState("");
  const [formError, setFormError] = useState("");

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const dayNumber = index - startDay + 1;
      if (dayNumber < 1 || dayNumber > totalDays) return null;
      return new Date(year, month, dayNumber);
    });
  }, [calendarMonth]);

  function formatDate(date) {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function moveCalendar(direction) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const seedAmount = Number(seedPool);
    if (!Number.isFinite(seedAmount) || seedAmount < MIN_SEED_POOL) {
      setSeedPool(String(MIN_SEED_POOL));
      return;
    }
    if (resolver === "Third party" && !thirdPartyResolverId) {
      setFormError("Choose a friend to resolve this market.");
      return;
    }
    const communityId = form.get("community") || null;
    const selectedCommunity = communities.find((group) => String(group.id || group.name) === String(communityId));
    const thirdParty = friendsList.find((friend) => friend.id === thirdPartyResolverId);
    onCreate({
      title: form.get("title"),
      description: "Created from Chalk.",
      communityId,
      community: selectedCommunity?.name || "No community",
      privacy: "Private",
      resolver,
      closes: dateValue || "TBD",
      yes: Number(startingYes),
      seedPool: seedAmount,
      sendToFriendId,
      thirdPartyResolverId: resolver === "Third party" ? thirdPartyResolverId : null,
      thirdPartyResolverName: resolver === "Third party" ? thirdParty?.name : null,
    });
  }

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <div className="sheet-grabber" />
        <div className="modal-intro">
          <h3>New market</h3>
        </div>
        <div className="new-market-form">
          <label className="field wide">
            <textarea
              name="title"
              required
              placeholder="What's the bet? e.g. Will Jake hook up before NYE?"
            />
          </label>
          <label className="field wide send-field">
            <span>Send to friend</span>
            <select value={sendToFriendId} onChange={(event) => setSendToFriendId(event.target.value)}>
              <option value="">Do not send</option>
              {friendsList.map((friend) => (
                <option key={friend.id} value={friend.id}>{friend.name}</option>
              ))}
            </select>
          </label>
          <label className="field wide select-field">
            <select name="community">
              <option value="">No community</option>
              {communities.map((group) => <option key={group.id || group.name} value={group.id || group.name}>{group.name}</option>)}
            </select>
          </label>
          <div className="field wide date-field">
            <input
              name="closes"
              type="text"
              placeholder="mm/dd/yyyy"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
            <button type="button" className="calendar-trigger" aria-label="Open calendar" onClick={() => setCalendarOpen((open) => !open)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="5" width="16" height="15" rx="3" />
                <path d="M8 3v4M16 3v4M4 10h16" />
              </svg>
            </button>
            {calendarOpen && (
              <div className="calendar-popover">
                <div className="calendar-head">
                  <button type="button" aria-label="Previous month" onClick={() => moveCalendar(-1)}>‹</button>
                  <strong>{calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong>
                  <button type="button" aria-label="Next month" onClick={() => moveCalendar(1)}>›</button>
                </div>
                <div className="calendar-weekdays">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
                </div>
                <div className="calendar-grid">
                  {calendarDays.map((day, index) => (
                    <button
                      type="button"
                      key={day ? day.toISOString() : `empty-${index}`}
                      disabled={!day}
                      className={day && dateValue === formatDate(day) ? "selected" : ""}
                      onClick={() => {
                        setDateValue(formatDate(day));
                        setCalendarOpen(false);
                      }}
                    >
                      {day ? day.getDate() : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="resolution-block">
            <span>Resolution Method</span>
            <div className="resolution-options">
              {["Vote", "Creator", "Third party"].map((option) => (
                <button
                  type="button"
                  key={option}
                  className={resolver === option ? "active" : ""}
                  onClick={() => {
                    setResolver(option);
                    setFormError("");
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          {resolver === "Third party" && (
            <label className="field wide send-field">
              <span>Third-party resolver</span>
              <select value={thirdPartyResolverId} onChange={(event) => setThirdPartyResolverId(event.target.value)}>
                <option value="">Choose friend</option>
                {friendsList.map((friend) => (
                  <option key={friend.id} value={friend.id}>{friend.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="resolution-block">
            <span>Starting odds</span>
            <div className="starting-odds-row">
              <strong>YES {startingYes}%</strong>
              <input
                type="range"
                min="5"
                max="95"
                step="1"
                value={startingYes}
                onChange={(event) => setStartingYes(Number(event.target.value))}
              />
              <strong>NO {100 - startingYes}%</strong>
            </div>
          </div>
          <div className="creation-cost">
            <span>Seeded pool</span>
            <input
              aria-label="Seeded pool amount"
              type="number"
              min={MIN_SEED_POOL}
              value={seedPool}
              onChange={(event) => setSeedPool(event.target.value)}
            />
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <button className="post-market-button">Post Market</button>
        </div>
      </form>
    </div>
  );
}

function AuthGate({ onSession }) {
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("Lucas Maass");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!supabase) {
      setStatus("Supabase is not connected yet.");
      return;
    }
    setLoading(true);
    setStatus("");

    const authCall =
      mode === "signup"
        ? supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: name } },
          })
        : supabase.auth.signInWithPassword({ email, password });
    const { data, error } = await authCall;

    setLoading(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    if (data.session) {
      onSession(data.session);
      return;
    }
    setStatus("Check your email to confirm your account, then come back and log in.");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">C</div>
          <h1>Chalk<span>.</span></h1>
        </div>
        <div className="auth-copy">
          <p className="streak-label">Welcome</p>
          <h2>{mode === "signup" ? "Create your account" : "Log back in"}</h2>
          <p>Trade social markets with your groups and keep receipts when calls settle.</p>
        </div>
        <div className="auth-tabs">
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Sign up
          </button>
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Log in
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          )}
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button className="auth-submit" disabled={loading}>
            {loading ? "Working..." : mode === "signup" ? "Create Account" : "Log In"}
          </button>
          {status && <p className="auth-status">{status}</p>}
        </form>
      </section>
    </main>
  );
}

function Sidebar({ view, setView, credits, streak, claimReady, claimCountdown, onClaimCredits, openModal, user, onSignOut }) {
  const [showHero, setShowHero] = useState(true);
  const displayName = user?.user_metadata?.display_name || profile.name;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="app-head">
        <div className="brand">
          <div className="brand-mark">C</div>
          <h1>Chalk<span>.</span></h1>
        </div>
        <div className="head-actions">
          <button className="credit-pill" title="Credits" aria-label="Credits">
            <span>¢</span>
            <strong>{currency(credits)}</strong>
          </button>
          <button
            className={`claim-button ${claimReady ? "ready" : ""}`}
            type="button"
            onClick={onClaimCredits}
            disabled={!claimReady}
          >
            <span>{claimReady ? "Claim" : "Next"}</span>
            <strong>{claimReady ? "+1,000" : claimCountdown}</strong>
          </button>
          <button className="bell" title="Notifications" aria-label="Notifications">♢<i /></button>
          <button className="profile-dot" title={displayName} aria-label="Profile" onClick={() => setView("profile")}>
            {initials || profile.initials}
          </button>
          <button className="signout-button" type="button" onClick={onSignOut}>Log out</button>
        </div>
      </div>
      <nav className="nav">
        <button className={view === "markets" ? "active" : ""} onClick={() => setView("markets")}>⌂<span>Feed</span></button>
        <button className={view === "bets" ? "active" : ""} onClick={() => setView("bets")}>↗<span>My Bets</span></button>
        <button className="create-tab" aria-label="Create bet" title="Create bet" onClick={openModal}>+</button>
        <button className={view === "groups" ? "active" : ""} onClick={() => setView("groups")}>♧<span>Friends</span></button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}>♙<span>Profile</span></button>
      </nav>
      {showHero && (
        <div className="credit-card hero-card">
          <button type="button" className="hero-dismiss" aria-label="Dismiss closing soon alert" onClick={() => setShowHero(false)}>×</button>
          <div>
            <span className="streak-label">Tonight</span>
            <div className="credits">3 markets in your groups close in &lt; 12 hours.</div>
            <p className="subtle">Don't get caught holding NO on Sasha & Jordan again.</p>
          </div>
          <div className="hero-actions">
            <button className="primary">↗ See closing soon</button>
            <button className="secondary" onClick={openModal}>＋ New market</button>
          </div>
        </div>
      )}
    </aside>
  );
}

function MarketsView({ markets, currentUserId, voteCounts, tab, setTab, search, setSearch, onBuy, onResolve, onVote }) {
  const filteredMarkets = useMemo(
    () =>
      markets.filter((market) => {
        const matchesTab =
          tab === "all" || market.privacy.toLowerCase() === tab || market.status.toLowerCase().includes(tab);
        const text = `${market.title} ${market.community} ${market.description}`.toLowerCase();
        return matchesTab && text.includes(search.toLowerCase());
      }),
    [markets, search, tab],
  );

  return (
    <section>
      <div className="section-head">
        <h2>Markets</h2>
      </div>
      <div className="toolbar">
        <div className="tabs market-filters">
          {["all", "private", "public", "disputed"].map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
        <input className="search" value={search} placeholder="Search markets" onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="market-grid">
        {filteredMarkets.map((market) => (
          <MarketCard
            key={market.id}
            market={market}
            currentUserId={currentUserId}
            voteCounts={voteCounts}
            onBuy={onBuy}
            onResolve={onResolve}
            onVote={onVote}
          />
        ))}
        {filteredMarkets.length === 0 && (
          <article className="market-card compact-card">
            <h3>No markets yet.</h3>
            <p className="subtle">Tap the plus button to create the first market.</p>
          </article>
        )}
      </div>
    </section>
  );
}

function FriendsView({
  communities,
  communitySearch,
  setCommunitySearch,
  communityName,
  setCommunityName,
  communityType,
  setCommunityType,
  communityLogoKind,
  setCommunityLogoKind,
  communityLogoValue,
  setCommunityLogoValue,
  selectedCommunityId,
  setSelectedCommunityId,
  communityMessages,
  chatDraft,
  setChatDraft,
  markets,
  friendsList,
  sentMarkets,
  friendMarkets,
  friendUsername,
  setFriendUsername,
  onAddFriend,
  onCreateCommunity,
  onSendCommunityMessage,
  toast,
  onOpenMarket,
}) {
  const filteredCommunities = communities.filter((group) =>
    `${group.name} ${group.type}`.toLowerCase().includes(communitySearch.toLowerCase()),
  );
  const activeCommunity = communities.find((group) => String(group.id) === String(selectedCommunityId));
  const activeMessages = communityMessages.filter((message) => String(message.communityId) === String(selectedCommunityId));
  const activeCommunityMarkets = markets.filter((market) => String(market.communityId) === String(selectedCommunityId));
  const logoChoices = ["🏠", "🔥", "🏀", "🎲", "📈", "🏆", "💬", "🌙"];

  function handleCommunityLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCommunityLogoKind("image");
      setCommunityLogoValue(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  if (activeCommunity) {
    return (
      <section>
        <button className="back-button" type="button" onClick={() => setSelectedCommunityId("")}>
          ← Communities
        </button>
        <article className="market-card community-room">
          <div className="market-top">
            <div className="community-room-title">
              <CommunityLogo community={activeCommunity} large />
              <div>
                <h3>{activeCommunity.name}</h3>
                <p className="subtle">{activeCommunity.type} · {activeCommunity.members} members</p>
              </div>
            </div>
            <Pill tone={activeCommunity.type === "Public" ? "hot" : "good"}>{activeCommunity.type}</Pill>
          </div>
          <div className="community-room-section">
            <h4>Past bets</h4>
            <div className="friend-bet-list">
              {activeCommunityMarkets.length === 0 ? (
                <p className="subtle">No bets have been posted in this community yet.</p>
              ) : (
                activeCommunityMarkets.map((market) => (
                  <button className="mini-market-tile" type="button" key={market.id} onClick={() => onOpenMarket(market.id)}>
                    <span className="mini-market-status">{market.status}</span>
                    <strong>{market.title}</strong>
                    <div>
                      <span className={market.yes === 50 ? "even" : "yes"}>YES {market.yes}%</span>
                      <span className={market.yes === 50 ? "even" : "no"}>NO {100 - market.yes}%</span>
                    </div>
                    <small>{market.traders ?? 0} traders · {market.volume.toLocaleString()} volume</small>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="community-room-section">
            <h4>Chat</h4>
            <form className="community-chat-form" onSubmit={(event) => onSendCommunityMessage(event, activeCommunity.id)}>
              <input
                value={chatDraft}
                placeholder={`Message ${activeCommunity.name}`}
                onChange={(event) => setChatDraft(event.target.value)}
              />
              <button type="submit">Send</button>
            </form>
            <div className="community-chat">
              {activeMessages.length === 0 ? (
                <p className="subtle">No chat posts yet. Markets posted to this community will appear here.</p>
              ) : (
                activeMessages.map((message) => (
                  <button type="button" key={message.id} onClick={() => message.marketId && onOpenMarket(message.marketId)}>
                    <strong>{message.body}</strong>
                    <span>{message.senderName} · {message.createdAt}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section>
      <div className="topbar">
        <div className="title">
          <h2>Communities</h2>
          <p>Search every community, create your own, and watch posted markets land in the community chat.</p>
        </div>
      </div>
      <form className="friend-add-card" onSubmit={onAddFriend}>
        <label>
          <span>Add friend</span>
          <input
            value={friendUsername}
            placeholder="@username"
            onChange={(event) => setFriendUsername(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="primary">Add</button>
      </form>
      <form className="community-create-card" onSubmit={onCreateCommunity}>
        <label>
          <span>Create community</span>
          <input value={communityName} placeholder="Community name" onChange={(event) => setCommunityName(event.target.value)} required />
        </label>
        <div className="community-logo-picker">
          <span>Logo</span>
          <div className="community-create-preview">
            <CommunityLogo community={{ logoKind: communityLogoKind, logoValue: communityLogoValue }} />
            <strong>{communityName || "New community"}</strong>
          </div>
          <div className="emoji-options">
            {logoChoices.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={communityLogoKind === "emoji" && communityLogoValue === emoji ? "selected" : ""}
                onClick={() => {
                  setCommunityLogoKind("emoji");
                  setCommunityLogoValue(emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <label className="logo-upload">
            <input type="file" accept="image/*" onChange={handleCommunityLogoUpload} />
            Upload picture
          </label>
        </div>
        <label>
          <span>Type</span>
          <select value={communityType} onChange={(event) => setCommunityType(event.target.value)}>
            <option>Private</option>
            <option>Public</option>
          </select>
        </label>
        <button type="submit" className="primary">Create</button>
      </form>
      <label className="community-search">
        <span>Search communities</span>
        <input value={communitySearch} placeholder="Search all communities" onChange={(event) => setCommunitySearch(event.target.value)} />
      </label>
      <div className="market-grid">
        <article className="market-card compact-card">
          <h3>Friends</h3>
          <div className="friend-list">
            {friendsList.length === 0 ? (
              <p className="subtle">No friends yet. Add someone by username once they have a Chalk account.</p>
            ) : (
              friendsList.map((friend) => (
                <div className="dm-row" key={friend.id}>
                  <Avatar person={friend} color={friend.color} />
                  <div><strong>{friend.name}</strong><span>{friend.line}</span></div>
                </div>
              ))
            )}
          </div>
        </article>
        <article className="market-card compact-card">
          <h3>Sent to you</h3>
          <div className="friend-bet-list">
            {sentMarkets.length === 0 ? (
              <p className="subtle">Markets your friends send you will appear here.</p>
            ) : (
              sentMarkets.map((market) => (
                <button type="button" key={`${market.id}-${market.sentBy}`} onClick={() => onOpenMarket(market.id)}>
                  <strong>{market.title}</strong>
                  <span>Sent by {market.sentBy}</span>
                </button>
              ))
            )}
          </div>
        </article>
        <article className="market-card compact-card">
          <h3>Friends' markets</h3>
          <div className="friend-bet-list">
            {friendMarkets.length === 0 ? (
              <p className="subtle">When your friends create markets, they will show here.</p>
            ) : (
              friendMarkets.map((market) => (
                <button type="button" key={market.id} onClick={() => onOpenMarket(market.id)}>
                  <strong>{market.title}</strong>
                  <span>By {market.creator}</span>
                </button>
              ))
            )}
          </div>
        </article>
        <article className="market-card compact-card community-directory">
          <h3>My communities</h3>
          <div className="friend-bet-list">
            {filteredCommunities.length === 0 ? (
              <p className="subtle">No communities match that search.</p>
            ) : (
              filteredCommunities.map((group) => (
                <button className="community-directory-row" type="button" key={group.id || group.name} onClick={() => setSelectedCommunityId(group.id)}>
                  <CommunityLogo community={group} />
                  <span>
                    <strong>{group.name}</strong>
                    <small>{group.type} · {group.members} members</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function ProfileView({ positions, userProfile }) {
  const [showHistory, setShowHistory] = useState(false);
  const resolvedBets = positions.filter((position) => position.status === "Resolved");
  const wins = resolvedBets.filter((position) => position.profit > 0);
  const winRate = resolvedBets.length ? Math.round((wins.length / resolvedBets.length) * 100) : 0;
  const totalVolume = positions.reduce((sum, position) => sum + position.amount, 0);
  const netProfit = resolvedBets.reduce((sum, position) => sum + (position.profit ?? 0), 0);
  const displayName = userProfile?.display_name || profile.name;
  const handle = userProfile?.handle ? `@${userProfile.handle}` : profile.handle;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section>
      <div className="topbar">
        <div className="title">
          <h2>{displayName}</h2>
          <p>{handle}</p>
        </div>
      </div>
      <div className="market-grid">
        <article className="profile-card">
          <div className="hero-profile">
            <Avatar initials={initials || profile.initials} color="violet" />
            <div>
              <h3>{displayName} <span className="subtle">{handle}</span></h3>
              <p className="subtle">Record {wins.length}-{Math.max(0, resolvedBets.length - wins.length)} · {winRate}% win rate</p>
            </div>
          </div>
          <div className="profile-stats">
            <div>
              <span>Win rate</span>
              <strong>{winRate}%</strong>
            </div>
            <div>
              <span>Net profit</span>
              <strong className={netProfit >= 0 ? "profit-good" : "profit-bad"}>
                {netProfit >= 0 ? "+" : ""}{netProfit.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Total bets</span>
              <strong>{positions.length}</strong>
            </div>
            <div>
              <span>Total volume</span>
              <strong>{totalVolume.toLocaleString()}</strong>
            </div>
          </div>
        </article>
        <button className="history-toggle" type="button" onClick={() => setShowHistory((value) => !value)}>
          {showHistory ? "Hide bet history" : "View bet history"}
        </button>
        {showHistory && resolvedBets.length > 0 ? (
          resolvedBets.map((bet) => (
            <article className={`receipt ${bet.profit >= 0 ? "win" : "loss"}`} key={bet.id}>
              <p className="meta">Receipt Card</p>
              <h3>{bet.profit >= 0 ? "+" : ""}{bet.profit.toLocaleString()}</h3>
              <p>{bet.profit >= 0 ? "Won" : "Lost"} {bet.side.toUpperCase()} on “{bet.title}.”</p>
              <div className="receipt-foot">
                <strong>CHALK</strong>
                <span className="subtle">Bet {bet.amount.toLocaleString()}</span>
              </div>
            </article>
          ))
        ) : showHistory ? (
          <article className="market-card compact-card">
            <h3>No receipt cards yet.</h3>
            <p className="subtle">Resolve a bet and your receipt will appear here.</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function MyBetsView({ positions, createdMarkets }) {
  const totalItems = positions.length + createdMarkets.length;

  return (
    <section>
      <div className="section-head">
        <h2>My Bets</h2>
        <button>{totalItems} total</button>
      </div>
      <div className="market-grid">
        {totalItems === 0 && (
          <article className="market-card compact-card">
            <h3>No bets yet.</h3>
            <p className="subtle">Create a market or place a trade and it will appear here automatically.</p>
          </article>
        )}
        {createdMarkets.map((market) => (
          <article className="market-card compact-card" key={`created-${market.id}`}>
            <div className="market-top">
              <span className="community-dot"><i />{market.community}</span>
              <Pill tone={market.status === "Resolved" ? "bad" : "good"}>Created</Pill>
            </div>
            <h3>{market.title}</h3>
            <div className="bet-summary">
              <div>
                <span>YES</span>
                <strong>{market.yes}%</strong>
              </div>
              <div>
                <span>Volume</span>
                <strong>{market.volume.toLocaleString()}</strong>
              </div>
              <div>
                <span>Traders</span>
                <strong>{market.traders ?? 0}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{market.status}</strong>
              </div>
            </div>
          </article>
        ))}
        {positions.map((position) => (
          <article className="market-card compact-card" key={position.id}>
            <div className="market-top">
              <span className="community-dot"><i />{position.community}</span>
              <Pill tone={position.side === "yes" ? "good" : "bad"}>{position.side.toUpperCase()}</Pill>
            </div>
            <h3>{position.title}</h3>
            <div className="bet-summary">
              <div>
                <span>Volume</span>
                <strong>{position.amount.toLocaleString()}</strong>
              </div>
              <div>
                <span>Price</span>
                <strong>{position.entryPrice}%</strong>
              </div>
              <div>
                <span>Payout</span>
                <strong>{(position.finalPayout ?? position.payout).toLocaleString()}</strong>
              </div>
              <div>
                <span>P/L</span>
                <strong className={(position.profit ?? 0) >= 0 ? "profit-good" : "profit-bad"}>
                  {position.status === "Resolved" ? `${position.profit >= 0 ? "+" : ""}${position.profit.toLocaleString()}` : "Open"}
                </strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DmsView({ setView, toast }) {
  return (
    <section>
      <div className="topbar">
        <div className="title">
          <h2>DMs for side-eye and side bets.</h2>
          <p>Friends can message, flag rivals, and jump straight from a thread into a market.</p>
        </div>
      </div>
      <div className="market-grid">
        {friends.map((friend) => (
          <article className="market-card" key={friend.name}>
            <div className="profile-line">
              <Avatar person={friend} color={friend.color} />
              <div><strong>{friend.name}</strong><span>{friend.line}</span></div>
            </div>
            <p className="desc">“I am absolutely saving this receipt when you are wrong.”</p>
            <div className="trade-controls">
              <button className="secondary" onClick={() => toast(`${friend.name} is now your rival.`)}>Flag rival</button>
              <button className="primary" onClick={() => setView("markets")}>Open market</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ShopView({ onBuyCosmetic }) {
  const items = [
    ["Profile frame", 250, "Neon border for profile cards"],
    ["Avatar pack", 400, "New initials styles and background plates"],
    ["Receipt ink", 150, "Premium share card themes"],
    ["Trophy shelf", 800, "Season winner display module"],
  ];
  return (
    <section>
      <div className="topbar">
        <div className="title">
          <h2>Balance is for clout too.</h2>
          <p>Your balance can buy contracts or profile upgrades. Every user can claim 1,000 credits every 24 hours.</p>
        </div>
      </div>
      <div className="market-grid">
        {items.map(([name, price, desc]) => (
          <article className="market-card" key={name}>
            <Pill tone="hot">{currency(price)}</Pill>
            <h3>{name}</h3>
            <p className="desc">{desc}</p>
            <button className="primary" onClick={() => onBuyCosmetic(name, price)}>Buy cosmetic</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function SocialRail() {
  return (
    <aside className="social-rail">
      <div className="side-block">
        <h3>Townhouse 4B Leaderboard</h3>
        <div className="mini-list">
          {leaderboard.map((person, index) => (
            <div className="leader-row" key={person.name}>
              <strong>#{index + 1}</strong>
              <Avatar person={person} color={person.color} />
              <div><strong>{person.name}</strong><span>{person.record}</span></div>
              <Pill tone={person.pnl >= 0 ? "good" : "bad"}>{person.pnl >= 0 ? "+" : ""}{person.pnl}</Pill>
            </div>
          ))}
        </div>
      </div>
      <div className="side-block">
        <h3>Reports & Sanctions</h3>
        <p className="subtle">Community reports trigger a vote. Majority-confirmed bad resolutions increase cooldowns on betting and market creation.</p>
        <div className="mini-list">
          <Pill tone="bad">Riley market: 6 reports</Pill>
          <Pill>First offense: 24h cooldown</Pill>
          <Pill>Repeat: 7d+ restrictions</Pill>
        </div>
      </div>
      <div className="side-block">
        <h3>Friends</h3>
        <div className="mini-list">
          {friends.map((friend) => (
            <div className="dm-row" key={friend.name}>
              <Avatar person={friend} color={friend.color} />
              <div><strong>{friend.name}</strong><span>{friend.line}</span></div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState("markets");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [credits, setCredits] = useState(INFINITE_CREDITS);
  const [streak, setStreak] = useState(12);
  const [markets, setMarkets] = useState(initialMarkets);
  const [positions, setPositions] = useState([]);
  const [communities, setCommunities] = useState(initialCommunities);
  const [communityMessages, setCommunityMessages] = useState([]);
  const [communitySearch, setCommunitySearch] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [communityType, setCommunityType] = useState("Private");
  const [communityLogoKind, setCommunityLogoKind] = useState("emoji");
  const [communityLogoValue, setCommunityLogoValue] = useState("🏠");
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [friendsList, setFriendsList] = useState([]);
  const [sentMarkets, setSentMarkets] = useState([]);
  const [voteCounts, setVoteCounts] = useState({});
  const [friendUsername, setFriendUsername] = useState("");
  const [modal, setModal] = useState(null);
  const [toastText, setToastText] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setDataReady(false);
      setUserProfile(null);
      setMarkets(initialMarkets);
      setPositions([]);
      setCommunities(initialCommunities);
      setCommunityMessages([]);
      setVoteCounts({});
      setFriendsList([]);
      setSentMarkets([]);
      return;
    }
    loadAppData(session.user);
  }, [session]);

  async function loadAppData(user) {
    if (!supabase) {
      setDataReady(true);
      return;
    }

    setDataReady(false);
    const profileDraft = profileFromUser(user);
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    let nextProfile = existingProfile;
    if (!nextProfile && !profileError) {
      const { data: createdProfile, error: createError } = await supabase
        .from("profiles")
        .insert(profileDraft)
        .select("*")
        .single();
      if (createError) {
        toast(createError.message);
      } else {
        nextProfile = createdProfile;
      }
    }

    if (nextProfile) {
      const updates = {};
      if (!nextProfile.email && user.email) updates.email = user.email;
      if (nextProfile.display_name !== profileDraft.display_name && user.user_metadata?.display_name) {
        updates.display_name = profileDraft.display_name;
      }
      if (Object.keys(updates).length) {
        const { data: updatedProfile } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", user.id)
          .select("*")
          .single();
        nextProfile = updatedProfile || nextProfile;
      }
      setUserProfile(nextProfile);
      setCredits(nextProfile.credits ?? 0);
    }

    const [
      { data: marketRows, error: marketsError },
      { data: positionRows, error: positionsError },
      { data: communityRows, error: communitiesError },
    ] =
      await Promise.all([
        supabase.from("markets").select("*").order("created_at", { ascending: false }),
        supabase.from("positions").select("*").eq("profile_id", user.id).order("created_at", { ascending: false }),
        supabase.from("communities").select("*").order("created_at", { ascending: false }),
      ]);

    if (marketsError) toast(marketsError.message);
    if (positionsError) toast(positionsError.message);
    if (communitiesError) toast(communitiesError.message);
    setMarkets((marketRows ?? []).map(marketFromRow));
    setPositions((positionRows ?? []).map(positionFromRow));
    const nextCommunities = (communityRows ?? []).map(communityFromRow);
    setCommunities(nextCommunities);
    await Promise.all([loadFriends(user.id), loadSentMarkets(user.id), loadCommunityMessages(), loadVoteCounts(user.id)]);
    setDataReady(true);
  }

  async function loadVoteCounts(userId) {
    if (!supabase) return;
    const { data: rows, error } = await supabase.from("market_votes").select("market_id, voter_id, vote");
    if (error) {
      toast(error.message);
      return;
    }
    const counts = {};
    (rows ?? []).forEach((row) => {
      if (!counts[row.market_id]) counts[row.market_id] = { yes: 0, no: 0, myVote: null };
      counts[row.market_id][row.vote] += 1;
      if (row.voter_id === userId) counts[row.market_id].myVote = row.vote;
    });
    setVoteCounts(counts);
  }

  async function loadCommunityMessages() {
    if (!supabase) return;
    const { data: rows, error } = await supabase
      .from("community_messages")
      .select("id, community_id, market_id, sender_id, body, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast(error.message);
      return;
    }
    const senderIds = [...new Set((rows ?? []).map((row) => row.sender_id))];
    let senderMap = new Map();
    if (senderIds.length) {
      const { data: senderRows } = await supabase.from("profiles").select("id, display_name, handle").in("id", senderIds);
      senderMap = new Map((senderRows ?? []).map((row) => [row.id, row.display_name || row.handle || "Chalk user"]));
    }
    setCommunityMessages(
      (rows ?? []).map((row) => ({
        id: row.id,
        communityId: row.community_id,
        marketId: row.market_id,
        body: row.body,
        senderName: senderMap.get(row.sender_id) || "Chalk user",
        createdAt: new Date(row.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      })),
    );
  }

  async function sendCommunityMessage(event, communityId) {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body || !supabase || !userProfile) return;
    const { data, error } = await supabase
      .from("community_messages")
      .insert({
        community_id: communityId,
        sender_id: userProfile.id,
        body,
      })
      .select("id, community_id, market_id, body, created_at")
      .single();
    if (error) {
      toast(error.message);
      return;
    }
    setCommunityMessages((current) => [
      {
        id: data.id,
        communityId: data.community_id,
        marketId: data.market_id,
        body: data.body,
        senderName: userProfile.display_name,
        createdAt: new Date(data.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      },
      ...current,
    ]);
    setChatDraft("");
  }

  async function loadFriends(userId) {
    if (!supabase) return;
    const { data: friendshipRows, error } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("owner_id", userId);
    if (error) {
      toast(error.message);
      return;
    }
    const friendIds = (friendshipRows ?? []).map((row) => row.friend_id);
    if (!friendIds.length) {
      setFriendsList([]);
      return;
    }
    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, email, handle")
      .in("id", friendIds);
    if (profilesError) {
      toast(profilesError.message);
      return;
    }
    setFriendsList((profileRows ?? []).map(friendFromProfile));
  }

  async function loadSentMarkets(userId) {
    if (!supabase) return;
    const { data: sendRows, error } = await supabase
      .from("market_sends")
      .select("market_id, sender_id, created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      toast(error.message);
      return;
    }
    const rows = sendRows ?? [];
    if (!rows.length) {
      setSentMarkets([]);
      return;
    }

    const marketIds = [...new Set(rows.map((row) => row.market_id))];
    const senderIds = [...new Set(rows.map((row) => row.sender_id))];
    const [{ data: marketRows, error: marketsError }, { data: senderRows, error: sendersError }] =
      await Promise.all([
        supabase.from("markets").select("*").in("id", marketIds),
        supabase.from("profiles").select("id, display_name, handle").in("id", senderIds),
      ]);
    if (marketsError) toast(marketsError.message);
    if (sendersError) toast(sendersError.message);

    const marketMap = new Map((marketRows ?? []).map((row) => [row.id, marketFromRow(row)]));
    const senderMap = new Map((senderRows ?? []).map((row) => [row.id, row.display_name || row.handle || "Friend"]));
    setSentMarkets(
      rows
        .map((row) => {
          const market = marketMap.get(row.market_id);
          return market ? { ...market, sentBy: senderMap.get(row.sender_id) || "Friend" } : null;
        })
        .filter(Boolean),
    );
  }

  async function addFriend(event) {
    event.preventDefault();
    if (!supabase || !userProfile) return;
    const username = friendUsername.trim().replace(/^@/, "").toLowerCase();
    if (!username) return;
    if (username === userProfile.handle) {
      toast("You cannot add yourself.");
      return;
    }
    const { data: friendProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id, display_name, email, handle")
      .eq("handle", username)
      .maybeSingle();
    if (lookupError) {
      toast(lookupError.message);
      return;
    }
    if (!friendProfile) {
      toast("No Chalk account found for that username yet.");
      return;
    }
    const { error } = await supabase.from("friendships").insert({
      owner_id: userProfile.id,
      friend_id: friendProfile.id,
    });
    if (error) {
      toast(error.code === "23505" ? "Friend already added." : error.message);
      return;
    }
    setFriendsList((current) => [friendFromProfile(friendProfile), ...current]);
    setFriendUsername("");
    toast(`${friendProfile.display_name} added.`);
  }

  async function sendMarket(marketId, friendId) {
    if (!supabase || !userProfile) return false;
    const { error } = await supabase.from("market_sends").insert({
      market_id: marketId,
      sender_id: userProfile.id,
      recipient_id: friendId,
    });
    if (error) {
      toast(error.code === "23505" ? "You already sent this market to that friend." : error.message);
      return false;
    }
    const friend = friendsList.find((item) => item.id === friendId);
    toast(`Sent market to ${friend?.name || "friend"}.`);
    return true;
  }

  function openMarketFromFriends(marketId) {
    setSearch("");
    setTab("all");
    setView("markets");
    const market = markets.find((item) => item.id === marketId) || sentMarkets.find((item) => item.id === marketId);
    if (market) toast(`Opened: ${market.title}`);
  }

  async function saveCredits(nextCredits) {
    setCredits(nextCredits);
    if (supabase && userProfile && nextCredits < INFINITE_CREDITS) {
      await supabase.from("profiles").update({ credits: nextCredits }).eq("id", userProfile.id);
      setUserProfile((current) => (current ? { ...current, credits: nextCredits } : current));
    }
  }

  async function claimCredits() {
    if (!userProfile) return;
    if (!canClaimCredits(userProfile.last_credit_claim_at, now)) {
      toast(`Next claim in ${claimCountdownLabel(userProfile.last_credit_claim_at, now)}.`);
      return;
    }
    const claimedAt = new Date().toISOString();
    const nextCredits = (credits >= INFINITE_CREDITS ? 0 : credits) + DAILY_CLAIM_AMOUNT;
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          credits: nextCredits,
          last_credit_claim_at: claimedAt,
        })
        .eq("id", userProfile.id)
        .select("*")
        .single();
      if (error) {
        toast(error.message);
        return;
      }
      setUserProfile(data);
    } else {
      setUserProfile((current) => (current ? { ...current, credits: nextCredits, last_credit_claim_at: claimedAt } : current));
    }
    setCredits(nextCredits);
    setNow(Date.now());
    toast("Claimed 1,000 credits.");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }

  function toast(message) {
    setToastText(message);
    window.clearTimeout(window.chalkToast);
    window.chalkToast = window.setTimeout(() => setToastText(""), 2400);
  }

  async function buy(marketId, side, amount = TRADE_CREDITS) {
    const tradeAmount = Number(amount);
    if (!Number.isFinite(tradeAmount) || tradeAmount < MIN_TRADE_AMOUNT) {
      toast("Minimum bet is 50.");
      return false;
    }
    const market = markets.find((item) => item.id === marketId);
    if (market?.thirdPartyResolverId === userProfile?.id) {
      toast("You are the third-party resolver and cannot bet in this market.");
      return false;
    }
    const payout = market ? estimatePoolPayout(market, side, tradeAmount) : 0;
    if (payout < tradeAmount) {
      toast("Payout must be at least your bet.");
      return false;
    }
    if (market?.status === "Resolved") {
      toast("This market is resolved.");
      return false;
    }
    if (credits < tradeAmount) {
      toast("Not enough balance for this trade.");
      return false;
    }
    const entryPrice = market ? (side === "yes" ? market.yes : 100 - market.yes) : 50;
    const alreadyTraded = positions.some((position) => position.marketId === marketId);
    const updatedMarket = market
      ? {
          ...buyWithPool(market, side, tradeAmount),
          traders: alreadyTraded ? market.traders ?? 0 : (market.traders ?? 0) + 1,
        }
      : null;

    if (supabase && updatedMarket && userProfile) {
      const { error: marketError } = await supabase
        .from("markets")
        .update({
          yes_price: updatedMarket.yes,
          yes_pool: updatedMarket.yesPool,
          no_pool: updatedMarket.noPool,
          volume: updatedMarket.volume,
          traders: updatedMarket.traders,
          history: updatedMarket.history,
        })
        .eq("id", marketId);

      if (marketError) {
        toast(marketError.message);
        return false;
      }

      const { data: positionRow, error: positionError } = await supabase
        .from("positions")
        .insert({
          market_id: marketId,
          profile_id: userProfile.id,
          side,
          shares: tradeAmount,
          average_price: entryPrice,
          amount: tradeAmount,
          payout,
          status: "live",
          title_snapshot: market.title,
          community_snapshot: market.community,
        })
        .select("*")
        .single();

      if (positionError) {
        toast(positionError.message);
        return false;
      }

      setPositions((current) => [positionFromRow(positionRow), ...current]);
    } else if (market) {
      setPositions((current) => [
        {
          id: Date.now(),
          marketId,
          title: market.title,
          community: market.community,
          side,
          amount: tradeAmount,
          entryPrice,
          payout,
          status: "Live",
        },
        ...current,
      ]);
    }

    setMarkets((current) => current.map((item) => (item.id === marketId && updatedMarket ? updatedMarket : item)));
    await saveCredits(credits >= INFINITE_CREDITS ? credits : credits - tradeAmount);
    toast(`Bought ${tradeAmount.toLocaleString()} of ${side.toUpperCase()} from the pool.`);
    return true;
  }

  async function resolveMarket(marketId, outcome) {
    const market = markets.find((item) => item.id === marketId);
    if (!market || !outcome) return;
    const yesPool = market.yesPool ?? Math.round((market.volume * market.yes) / 100);
    const noPool = market.noPool ?? market.volume - yesPool;
    const totalPool = yesPool + noPool;
    const winningPool = outcome === "yes" ? yesPool : noPool;
    const nextPositions = positions.map((position) => {
        if (position.marketId !== marketId) return position;
        const finalPayout =
          position.side === outcome && winningPool > 0
            ? Math.round((position.amount / winningPool) * totalPool * (1 - POOL_FEE_RATE))
            : 0;
        return {
          ...position,
          status: "Resolved",
          outcome,
          finalPayout,
          profit: finalPayout - position.amount,
        };
      });
    const userPayout = nextPositions
      .filter((position) => position.marketId === marketId)
      .reduce((sum, position) => sum + (position.finalPayout ?? 0), 0);

    if (supabase) {
      const { error: marketError } = await supabase
        .from("markets")
        .update({ status: "resolved", outcome })
        .eq("id", marketId);
      if (marketError) {
        toast(marketError.message);
        return;
      }

      await Promise.all(
        nextPositions
          .filter((position) => position.marketId === marketId)
          .map((position) =>
            supabase
              .from("positions")
              .update({
                status: "resolved",
                outcome,
                final_payout: position.finalPayout,
                profit: position.profit,
              })
              .eq("id", position.id),
          ),
      );
    }

    setMarkets((current) =>
      current.map((item) => (item.id === marketId ? { ...item, status: "Resolved", outcome } : item)),
    );
    setPositions(nextPositions);
    if (userPayout > 0) {
      await saveCredits(credits >= INFINITE_CREDITS ? credits : credits + userPayout);
    }
    toast(`Resolved ${outcome.toUpperCase()}. My Bets now shows profit/loss.`);
  }

  async function voteOnMarket(marketId, vote) {
    if (!supabase || !userProfile) return;
    const market = markets.find((item) => item.id === marketId);
    if (!market || votingState(market, Date.now()) !== "open") {
      toast("Voting is not open for this market.");
      return;
    }
    const previousVote = voteCounts[marketId]?.myVote;
    const { error } = await supabase.from("market_votes").upsert(
      {
        market_id: marketId,
        voter_id: userProfile.id,
        vote,
      },
      { onConflict: "market_id,voter_id" },
    );
    if (error) {
      toast(error.message);
      return;
    }
    setVoteCounts((current) => {
      const currentCount = current[marketId] || { yes: 0, no: 0, myVote: null };
      const nextCount = { ...currentCount };
      if (previousVote && nextCount[previousVote] > 0) nextCount[previousVote] -= 1;
      if (previousVote !== vote) nextCount[vote] += 1;
      nextCount.myVote = vote;
      return { ...current, [marketId]: nextCount };
    });
    toast(`Voted ${vote.toUpperCase()}.`);
  }

  async function createMarket(draft) {
    const seedCost = draft.seedPool ?? MARKET_SEED_POOL;
    if (credits < seedCost) {
      toast(`Seeding this market costs ${seedCost.toLocaleString()}.`);
      return;
    }
    const pools = seededPools(draft.yes, seedCost);
    const nextMarket = {
        id: crypto.randomUUID(),
        ...draft,
        status: draft.privacy === "Public" ? "Pending approval" : "Live",
        yesPool: pools.yesPool,
        noPool: pools.noPool,
        yes: marketProbability(pools.yesPool, pools.noPool),
        history: [marketProbability(pools.yesPool, pools.noPool)],
        volume: seedCost,
        traders: 0,
        createdAt: new Date().toISOString().slice(0, 10),
        creator: userProfile?.display_name || session?.user?.email?.split("@")[0] || "Chalk user",
        creatorId: userProfile?.id,
        thirdPartyResolverId: draft.thirdPartyResolverId,
        thirdPartyResolverName: draft.thirdPartyResolverName,
      };

    if (supabase && userProfile) {
      const closeDate = parseCloseDate(nextMarket.closes) || new Date(Date.now() + 7 * 86400000);
      const { data, error } = await supabase
        .from("markets")
        .insert({
          id: nextMarket.id,
          creator_id: userProfile.id,
          community_id: nextMarket.communityId,
          community_name: nextMarket.community,
          title: nextMarket.title,
          description: nextMarket.description,
          status: dbStatus(nextMarket.status),
          resolver_mode: dbResolver(nextMarket.resolver),
          close_at: closeDate.toISOString(),
          yes_price: nextMarket.yes,
          yes_pool: nextMarket.yesPool,
          no_pool: nextMarket.noPool,
          seed_pool: seedCost,
          volume: seedCost,
          traders: 0,
          history: nextMarket.history,
          creator_name: nextMarket.creator,
          third_party_resolver_id: nextMarket.thirdPartyResolverId,
          third_party_resolver_name: nextMarket.thirdPartyResolverName,
        })
        .select("*")
        .single();
      if (error) {
        toast(error.message);
        return;
      }
      const createdMarket = marketFromRow(data);
      setMarkets((current) => [createdMarket, ...current]);
      if (draft.sendToFriendId) {
        await sendMarket(createdMarket.id, draft.sendToFriendId);
      }
      if (createdMarket.communityId) {
        await postMarketToCommunity(createdMarket);
      }
    } else {
      setMarkets((current) => [nextMarket, ...current]);
    }

    await saveCredits(credits >= INFINITE_CREDITS ? credits : credits - seedCost);
    setModal(null);
    toast(
      draft.sendToFriendId
        ? `Market posted and sent with a ${seedCost.toLocaleString()} seeded pool.`
        : `Market posted with a ${seedCost.toLocaleString()} seeded pool.`,
    );
  }

  async function postMarketToCommunity(market) {
    if (!supabase || !userProfile || !market.communityId) return;
    const { data, error } = await supabase
      .from("community_messages")
      .insert({
        community_id: market.communityId,
        market_id: market.id,
        sender_id: userProfile.id,
        body: `New market: ${market.title}`,
      })
      .select("id, community_id, market_id, body, created_at")
      .single();
    if (error) {
      toast(error.message);
      return;
    }
    setCommunityMessages((current) => [
      {
        id: data.id,
        communityId: data.community_id,
        marketId: data.market_id,
        body: data.body,
        senderName: userProfile.display_name,
        createdAt: new Date(data.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      },
      ...current,
    ]);
  }

  async function createCommunity(event) {
    event.preventDefault();
    const name = communityName.trim();
    if (!name) return;
    const type = communityType;
    const cost = 0;
    if (supabase && userProfile) {
      const { data, error } = await supabase
        .from("communities")
        .insert({
          name,
          type: dbCommunityType(type),
          creator_id: userProfile.id,
          creation_cost: cost,
          season_pot: 0,
          requires_market_approval: type === "Public",
          logo_kind: communityLogoKind,
          logo_value: communityLogoValue,
        })
        .select("*")
        .single();
      if (error) {
        toast(error.message);
        return;
      }
      const { error: memberError } = await supabase.from("community_members").insert({
        community_id: data.id,
        profile_id: userProfile.id,
        role: "creator",
      });
      if (memberError) {
        toast(memberError.message);
      }
      const nextCommunity = communityFromRow(data);
      setCommunities((current) => [nextCommunity, ...current]);
      setSelectedCommunityId(nextCommunity.id);
    } else {
      setCommunities((current) => [{
        id: crypto.randomUUID(),
        name,
        type,
        members: 1,
        pnl: 0,
        seasonPot: 0,
        logoKind: communityLogoKind,
        logoValue: communityLogoValue,
      }, ...current]);
    }
    setCommunityName("");
    setCommunityLogoKind("emoji");
    setCommunityLogoValue("🏠");
    toast(`${type} community created.`);
  }

  function buyCosmetic(name, price) {
    if (credits < price) {
      toast(`${name} costs ${price}.`);
      return;
    }
    setCredits((value) => (value >= INFINITE_CREDITS ? value : value - price));
    toast(`Purchased ${name} for ${price}.`);
  }

  const friendIds = friendsList.map((friend) => friend.id);
  const friendMarkets = markets.filter((market) => friendIds.includes(market.creatorId));
  const createdMarkets = markets.filter((market) => market.creatorId === userProfile?.id);
  const claimReady = canClaimCredits(userProfile?.last_credit_claim_at, now);
  const claimCountdown = claimCountdownLabel(userProfile?.last_credit_claim_at, now);

  useEffect(() => {
    if (!dataReady) return;
    markets.forEach((market) => {
      if (votingState(market, now) !== "ended") return;
      const votes = voteCounts[market.id] || { yes: 0, no: 0 };
      const outcome = votes.yes >= votes.no ? "yes" : "no";
      resolveMarket(market.id, outcome);
    });
  }, [now, dataReady, markets, voteCounts]);

  if (!authReady) {
    return <div className="loading-screen">Loading Chalk...</div>;
  }

  if (!session) {
    return <AuthGate onSession={setSession} />;
  }

  if (!dataReady) {
    return <div className="loading-screen">Loading your Chalk account...</div>;
  }

  return (
    <div className="shell">
      <Sidebar
        view={view}
        setView={setView}
        credits={credits}
        streak={streak}
        claimReady={claimReady}
        claimCountdown={claimCountdown}
        onClaimCredits={claimCredits}
        openModal={() => setModal("market")}
        user={session.user}
        onSignOut={signOut}
      />
      <main className="main">
        {view === "markets" && (
          <MarketsView
            markets={markets}
            currentUserId={userProfile?.id}
            voteCounts={voteCounts}
            tab={tab}
            setTab={setTab}
            search={search}
            setSearch={setSearch}
            onBuy={buy}
            onResolve={resolveMarket}
            onVote={voteOnMarket}
          />
        )}
        {view === "groups" && (
          <FriendsView
            communities={communities}
            communitySearch={communitySearch}
            setCommunitySearch={setCommunitySearch}
            communityName={communityName}
            setCommunityName={setCommunityName}
            communityType={communityType}
            setCommunityType={setCommunityType}
            communityLogoKind={communityLogoKind}
            setCommunityLogoKind={setCommunityLogoKind}
            communityLogoValue={communityLogoValue}
            setCommunityLogoValue={setCommunityLogoValue}
            selectedCommunityId={selectedCommunityId}
            setSelectedCommunityId={setSelectedCommunityId}
            communityMessages={communityMessages}
            chatDraft={chatDraft}
            setChatDraft={setChatDraft}
            markets={markets}
            friendsList={friendsList}
            sentMarkets={sentMarkets}
            friendMarkets={friendMarkets}
            friendUsername={friendUsername}
            setFriendUsername={setFriendUsername}
            onAddFriend={addFriend}
            onCreateCommunity={createCommunity}
            onSendCommunityMessage={sendCommunityMessage}
            toast={toast}
            onOpenMarket={openMarketFromFriends}
          />
        )}
        {view === "bets" && <MyBetsView positions={positions} createdMarkets={createdMarkets} />}
        {view === "profile" && <ProfileView positions={positions} userProfile={userProfile} />}
        {view === "dm" && <DmsView setView={setView} toast={toast} />}
        {view === "shop" && <ShopView onBuyCosmetic={buyCosmetic} />}
      </main>
      <SocialRail />
      {modal === "market" && (
        <MarketModal
          communities={communities}
          friendsList={friendsList}
          onClose={() => setModal(null)}
          onCreate={createMarket}
        />
      )}
      {toastText && <div className="toast">{toastText}</div>}
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);
