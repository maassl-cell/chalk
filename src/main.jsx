import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

const initialMarkets = [];

const initialCommunities = [
  { name: "Townhouse 4B", type: "Private", members: 18, pnl: 1180, seasonPot: 5400 },
  { name: "Campus After Dark", type: "Public", members: 1240, pnl: 420, seasonPot: 21800 },
  { name: "Sunday Group Chat", type: "Private", members: 12, pnl: -90, seasonPot: 1600 },
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

function Avatar({ person, initials, color = "violet" }) {
  return <div className={`avatar ${color}`}>{initials || person?.initials}</div>;
}

function Pill({ children, tone = "" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function MarketCard({ market, onBuy, onResolve }) {
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function openTicket(side) {
    if (market.status === "Resolved") return;
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

  function submitTrade() {
    if (!ticket) return;
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_TRADE_AMOUNT) {
      setTicketError("Minimum bet is 50.");
      return;
    }
    if (estimatedPayout < numericAmount) {
      setTicketError("Payout must be at least your bet.");
      return;
    }
    const placed = onBuy(market.id, ticket, numericAmount);
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
        <button disabled={market.status === "Resolved"} className={`trade-button ${market.yes === 50 ? "even" : ""} ${ticket === "yes" ? "active yes" : ""}`} onClick={() => openTicket("yes")}>
          YES&nbsp; {market.yes}%
        </button>
        <button disabled={market.status === "Resolved"} className={`trade-button ${market.yes === 50 ? "even" : ""} ${ticket === "no" ? "active no" : ""}`} onClick={() => openTicket("no")}>
          NO&nbsp; {no}%
        </button>
      </div>
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
        ) : (
          <>
            <button type="button" onClick={() => onResolve(market.id, "yes")}>Resolve YES</button>
            <button type="button" onClick={() => onResolve(market.id, "no")}>Resolve NO</button>
          </>
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

function MarketModal({ communities, onClose, onCreate }) {
  const [resolver, setResolver] = useState("Community vote");
  const [dateValue, setDateValue] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [startingYes, setStartingYes] = useState(50);
  const [seedPool, setSeedPool] = useState(String(MARKET_SEED_POOL));

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
    onCreate({
      title: form.get("title"),
      description: "Created from Chalk.",
      community: form.get("community") || "No community",
      privacy: "Private",
      resolver,
      closes: dateValue || "TBD",
      yes: Number(startingYes),
      seedPool: seedAmount,
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
          <label className="field wide select-field">
            <select name="community">
              <option>No community</option>
              {communities.map((group) => <option key={group.name}>{group.name}</option>)}
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
                  onClick={() => setResolver(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
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
          <button className="post-market-button">Post Market</button>
        </div>
      </form>
    </div>
  );
}

function Sidebar({ view, setView, credits, streak, onDaily, openModal }) {
  const [showHero, setShowHero] = useState(true);

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
          <button className="bell" title="Notifications" aria-label="Notifications">♢<i /></button>
          <button className="profile-dot" title="Profile" aria-label="Profile">{profile.initials}</button>
        </div>
      </div>
      <nav className="nav">
        <button className={view === "markets" ? "active" : ""} onClick={() => setView("markets")}>⌂<span>Feed</span></button>
        <button className={view === "bets" ? "active" : ""} onClick={() => setView("bets")}>↗<span>My Bets</span></button>
        <button className="create-tab" aria-label="Create bet" title="Create bet" onClick={openModal}>+</button>
        <button className={view === "groups" ? "active" : ""} onClick={() => setView("groups")}>♧<span>Groups</span></button>
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

function MarketsView({ markets, tab, setTab, search, setSearch, onBuy, onResolve }) {
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
        {filteredMarkets.map((market) => <MarketCard key={market.id} market={market} onBuy={onBuy} onResolve={onResolve} />)}
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

function GroupsView({ communities, onCreateCommunity, toast }) {
  return (
    <section>
      <div className="topbar">
        <div className="title">
          <h2>Communities keep the market honest.</h2>
          <p>Private groups are invite-only and trust-based. Public communities require app approval for markets and resolution rules.</p>
        </div>
        <div className="split">
          <button className="secondary" onClick={() => onCreateCommunity("Private")}>Private · 200</button>
          <button className="primary" onClick={() => onCreateCommunity("Public")}>Public · 500</button>
        </div>
      </div>
      <div className="market-grid">
        {communities.map((group) => (
          <article className="market-card" key={group.name}>
            <div className="market-top">
              <Pill tone={group.type === "Public" ? "hot" : "good"}>{group.type}</Pill>
              <Pill>{group.members} members</Pill>
            </div>
            <h3>{group.name}</h3>
            <div className="season-pot">
              <span className="eyebrow">Season winner pool</span>
              <strong>{currency(group.seasonPot)}</strong>
            </div>
            <div className="market-meta">
              <Pill>Current P/L: {group.pnl >= 0 ? "+" : ""}{currency(group.pnl)}</Pill>
              <Pill>Monthly season</Pill>
              <Pill>H2H records active</Pill>
            </div>
            <button className="resolve-button" onClick={() => toast(`Invite link copied for ${group.name}.`)}>
              Invite friends
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfileView({ positions }) {
  const [showHistory, setShowHistory] = useState(false);
  const resolvedBets = positions.filter((position) => position.status === "Resolved");
  const wins = resolvedBets.filter((position) => position.profit > 0);
  const winRate = resolvedBets.length ? Math.round((wins.length / resolvedBets.length) * 100) : 0;
  const totalVolume = positions.reduce((sum, position) => sum + position.amount, 0);
  const netProfit = resolvedBets.reduce((sum, position) => sum + (position.profit ?? 0), 0);

  return (
    <section>
      <div className="topbar">
        <div className="title">
          <h2>{profile.name}</h2>
          <p>{profile.handle}</p>
        </div>
      </div>
      <div className="market-grid">
        <article className="profile-card">
          <div className="hero-profile">
            <Avatar initials={profile.initials} color="violet" />
            <div>
              <h3>{profile.name} <span className="subtle">{profile.handle}</span></h3>
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

function MyBetsView({ positions }) {
  return (
    <section>
      <div className="section-head">
        <h2>My Bets</h2>
        <button>{positions.length} open</button>
      </div>
      <div className="market-grid">
        {positions.length === 0 && (
          <article className="market-card compact-card">
            <h3>No bets placed yet.</h3>
            <p className="subtle">Open a market, choose YES or NO, set your volume, and confirm the trade.</p>
          </article>
        )}
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
          <p>Your balance can buy contracts or profile upgrades. New users start at 1,000 and earn more for logging in.</p>
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
  const [view, setView] = useState("markets");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [credits, setCredits] = useState(INFINITE_CREDITS);
  const [streak, setStreak] = useState(12);
  const [markets, setMarkets] = useState(initialMarkets);
  const [positions, setPositions] = useState([]);
  const [communities, setCommunities] = useState(initialCommunities);
  const [modal, setModal] = useState(null);
  const [toastText, setToastText] = useState("");

  function toast(message) {
    setToastText(message);
    window.clearTimeout(window.chalkToast);
    window.chalkToast = window.setTimeout(() => setToastText(""), 2400);
  }

  function buy(marketId, side, amount = TRADE_CREDITS) {
    const tradeAmount = Number(amount);
    if (!Number.isFinite(tradeAmount) || tradeAmount < MIN_TRADE_AMOUNT) {
      toast("Minimum bet is 50.");
      return false;
    }
    const market = markets.find((item) => item.id === marketId);
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
    setMarkets((current) =>
      current.map((market) =>
        market.id === marketId
          ? {
              ...buyWithPool(market, side, tradeAmount),
              traders: alreadyTraded ? market.traders ?? 0 : (market.traders ?? 0) + 1,
            }
          : market,
      ),
    );
    if (market) {
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
        },
        ...current,
      ]);
    }
    setCredits((value) => (value >= INFINITE_CREDITS ? value : value - tradeAmount));
    toast(`Bought ${tradeAmount.toLocaleString()} of ${side.toUpperCase()} from the pool.`);
    return true;
  }

  function resolveMarket(marketId, outcome) {
    const market = markets.find((item) => item.id === marketId);
    if (!market || !outcome) return;
    const yesPool = market.yesPool ?? Math.round((market.volume * market.yes) / 100);
    const noPool = market.noPool ?? market.volume - yesPool;
    const totalPool = yesPool + noPool;
    const winningPool = outcome === "yes" ? yesPool : noPool;
    setMarkets((current) =>
      current.map((item) => (item.id === marketId ? { ...item, status: "Resolved", outcome } : item)),
    );
    let userPayout = 0;
    setPositions((current) =>
      current.map((position) => {
        if (position.marketId !== marketId) return position;
        const finalPayout =
          position.side === outcome && winningPool > 0
            ? Math.round((position.amount / winningPool) * totalPool * (1 - POOL_FEE_RATE))
            : 0;
        userPayout += finalPayout;
        return {
          ...position,
          status: "Resolved",
          outcome,
          finalPayout,
          profit: finalPayout - position.amount,
        };
      }),
    );
    if (userPayout > 0) {
      setCredits((value) => (value >= INFINITE_CREDITS ? value : value + userPayout));
    }
    toast(`Resolved ${outcome.toUpperCase()}. My Bets now shows profit/loss.`);
  }

  function createMarket(draft) {
    const seedCost = draft.seedPool ?? MARKET_SEED_POOL;
    if (credits < seedCost) {
      toast(`Seeding this market costs ${seedCost.toLocaleString()}.`);
      return;
    }
    const pools = seededPools(draft.yes, seedCost);
    setMarkets((current) => [
      {
        id: Date.now(),
        ...draft,
        status: draft.privacy === "Public" ? "Pending approval" : "Live",
        yesPool: pools.yesPool,
        noPool: pools.noPool,
        yes: marketProbability(pools.yesPool, pools.noPool),
        history: [marketProbability(pools.yesPool, pools.noPool)],
        volume: seedCost,
        traders: 0,
        createdAt: new Date().toISOString().slice(0, 10),
        creator: "Luca",
      },
      ...current,
    ]);
    setCredits((value) => (value >= INFINITE_CREDITS ? value : value - seedCost));
    setModal(null);
    toast(`Market posted with a ${seedCost.toLocaleString()} seeded pool.`);
  }

  function createCommunity(type) {
    const cost = type === "Public" ? 500 : 200;
    if (credits < cost) {
      toast(`${type} communities cost ${cost}.`);
      return;
    }
    setCredits((value) => (value >= INFINITE_CREDITS ? value : value - cost));
    setCommunities((current) => [{ name: type === "Public" ? "New Public Board" : "New Private Circle", type, members: 1, pnl: 0, seasonPot: 0 }, ...current]);
    toast(`${type} community created for ${cost}.`);
  }

  function daily() {
    setCredits((value) => (value >= INFINITE_CREDITS ? value : value + 100));
    setStreak((value) => value + 1);
    toast("Daily login paid 100.");
  }

  function buyCosmetic(name, price) {
    if (credits < price) {
      toast(`${name} costs ${price}.`);
      return;
    }
    setCredits((value) => (value >= INFINITE_CREDITS ? value : value - price));
    toast(`Purchased ${name} for ${price}.`);
  }

  return (
    <div className="shell">
      <Sidebar view={view} setView={setView} credits={credits} streak={streak} onDaily={daily} openModal={() => setModal("market")} />
      <main className="main">
        {view === "markets" && <MarketsView markets={markets} tab={tab} setTab={setTab} search={search} setSearch={setSearch} onBuy={buy} onResolve={resolveMarket} />}
        {view === "groups" && <GroupsView communities={communities} onCreateCommunity={createCommunity} toast={toast} />}
        {view === "bets" && <MyBetsView positions={positions} />}
        {view === "profile" && <ProfileView positions={positions} />}
        {view === "dm" && <DmsView setView={setView} toast={toast} />}
        {view === "shop" && <ShopView onBuyCosmetic={buyCosmetic} />}
      </main>
      <SocialRail />
      {modal === "market" && <MarketModal communities={communities} onClose={() => setModal(null)} onCreate={createMarket} />}
      {toastText && <div className="toast">{toastText}</div>}
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);
