/**
 * Five demo pages for the mock browser.
 *
 * They exist to give the Inspector something worth inspecting: between them
 * they cover the widgets a real test would have to deal with — long scrolls,
 * skeletons, grids, dropdowns, checkbox and radio groups, modals, popovers,
 * hover *and* click tooltips, spinners, progress bars, toggles, breadcrumbs,
 * images and a genuinely downloadable PDF.
 *
 * Each page is plain markup plus a shared behaviour script, injected into the
 * same document shell as the main mock app so it inherits the console/network
 * instrumentation and the Inspector overlay.
 *
 * Opening a new tab picks one at random.
 */

export interface SamplePage {
	/** The host this page answers on, e.g. `shop.demo.test`. */
	host: string
	title: string
	html: string
}

/** Hosts that resolve to a sample page rather than the main mock app. */
export const SAMPLE_HOST_SUFFIX = '.demo.test'

/**
 * Styling shared by all five pages. Deliberately plain CSS — the Inspector
 * reports computed styles, and a utility framework would make every reading
 * look the same.
 */
export const SAMPLE_CSS = `
.wrap{max-width:880px;margin:0 auto;padding:24px}
.crumbs{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#57606a;margin-bottom:18px}
.crumbs a{color:#0a69da;text-decoration:none}
.crumbs a:hover{text-decoration:underline}
.crumbs .sep{color:#afb8c1}
h1{font-size:26px;letter-spacing:-.02em;margin-bottom:8px}
h2{font-size:18px;margin:28px 0 10px}
h3{font-size:14px;margin-bottom:6px}
.lede{color:#57606a;font-size:14.5px;line-height:1.6;margin-bottom:20px;max-width:60ch}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.btn{height:34px;padding:0 14px;border-radius:8px;border:1px solid #d6dce2;background:#fff;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn:hover{background:#f6f8fa}
.btn.primary{background:#1f883d;border-color:#1f883d;color:#fff}
.btn.danger{background:#cf222e;border-color:#cf222e;color:#fff}
.btn.ghost{border-color:transparent;background:transparent;color:#0a69da}
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;max-width:360px}
.field label{font-size:12px;font-weight:600;color:#57606a}
.field input[type=text],.field input[type=email],.field select,.field textarea{height:36px;border:1px solid #d6dce2;border-radius:8px;padding:0 10px;font-size:14px;background:#fff;font-family:inherit}
.field textarea{height:auto;padding:8px 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.card{background:#fff;border:1px solid #e2e6ea;border-radius:12px;padding:16px}
.card p{font-size:12.5px;color:#57606a;line-height:1.5}
.list{display:flex;flex-direction:column;gap:10px}
.list .card{display:flex;gap:12px;align-items:flex-start}
.thumb{width:64px;height:64px;border-radius:10px;flex:0 0 auto;background:#eaeef2}
.swatch{width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #d6dce2;cursor:pointer}
.pill{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:600}
.pill.ok{background:#dafbe1;color:#1a7f37}
.pill.warn{background:#fff8c5;color:#9a6700}
.pill.bad{background:#ffebe9;color:#cf222e}
.pill.info{background:#ddebff;color:#0a69da}
.skeleton{background:linear-gradient(90deg,#eaeef2 25%,#f3f5f8 37%,#eaeef2 63%);background-size:400% 100%;animation:sk 1.4s ease infinite;border-radius:6px}
@keyframes sk{0%{background-position:100% 50%}100%{background-position:0 50%}}
.sk-line{height:10px;margin-bottom:8px}
.spinner{width:18px;height:18px;border:2px solid #d6dce2;border-top-color:#0a69da;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.bar{height:8px;background:#eaeef2;border-radius:999px;overflow:hidden}
.bar > i{display:block;height:100%;background:#0a69da;border-radius:999px;transition:width .4s ease}
.switch{position:relative;width:38px;height:22px;border-radius:999px;background:#d6dce2;cursor:pointer;transition:background .18s ease;flex:0 0 auto}
.switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .18s ease}
.switch.on{background:#1f883d}
.switch.on::after{transform:translateX(16px)}
.opts{display:flex;flex-direction:column;gap:8px}
.opts label{display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer}
.tipwrap{position:relative;display:inline-flex}
.tip{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#1f2328;color:#fff;font-size:12px;padding:5px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .14s ease;z-index:20}
.tipwrap:hover .tip,.tip.show{opacity:1}
.pop{position:absolute;top:calc(100% + 8px);left:0;width:230px;background:#fff;border:1px solid #e2e6ea;border-radius:10px;box-shadow:0 8px 24px rgba(31,35,40,.14);padding:12px;font-size:12.5px;color:#57606a;line-height:1.5;display:none;z-index:20}
.pop.show{display:block}
.modal-back{position:fixed;inset:0;background:rgba(31,35,40,.45);display:none;align-items:center;justify-content:center;z-index:50}
.modal-back.show{display:flex}
.modal{background:#fff;border-radius:14px;padding:20px;width:380px;max-width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.3)}
.modal h3{font-size:16px;margin-bottom:8px}
.modal p{font-size:13px;color:#57606a;line-height:1.55;margin-bottom:16px}
.modal .row{justify-content:flex-end}
.ico{width:16px;height:16px;flex:0 0 auto;vertical-align:-3px}
.tl{position:relative;padding-left:22px;border-left:2px solid #e2e6ea;margin-left:6px}
.tl .ev{position:relative;padding-bottom:22px}
.tl .ev::before{content:"";position:absolute;left:-28px;top:3px;width:10px;height:10px;border-radius:50%;background:#0a69da;box-shadow:0 0 0 3px #fff}
.tl .ev time{font-size:11.5px;color:#8c959f;display:block;margin-bottom:3px}
.muted{color:#8c959f;font-size:12px}
a.link{color:#0a69da}
`

/** A few inline icons, so the pages have real <svg> elements to pick. */
const ICON = {
	box: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
	doc: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h6"/></svg>',
	info: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
	bolt: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9Z"/></svg>',
	check: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m20 6-11 11-5-5"/></svg>',
	chart: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/></svg>',
}

/** A medium-sized illustration, inline so the page makes no network request. */
function art(hue: number, label: string) {
	return (
		'<svg class="art" viewBox="0 0 320 180" width="320" height="180" role="img" aria-label="' +
		label +
		'" style="border-radius:10px;display:block;max-width:100%">' +
		'<defs><linearGradient id="g' +
		hue +
		'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' +
		hue +
		',85%,62%)"/><stop offset="1" stop-color="hsl(' +
		(hue + 40) +
		',80%,48%)"/></linearGradient></defs>' +
		'<rect width="320" height="180" fill="url(#g' +
		hue +
		')"/>' +
		'<circle cx="70" cy="60" r="34" fill="rgba(255,255,255,.35)"/>' +
		'<rect x="120" y="96" width="150" height="12" rx="6" fill="rgba(255,255,255,.55)"/>' +
		'<rect x="120" y="118" width="96" height="12" rx="6" fill="rgba(255,255,255,.4)"/>' +
		'</svg>'
	)
}

const crumbs = (...parts: string[]) =>
	'<nav class="crumbs" aria-label="Breadcrumb">' +
	parts
		.map((p, i) =>
			i === parts.length - 1
				? '<span aria-current="page">' + p + '</span>'
				: '<a href="#">' + p + '</a><span class="sep">/</span>'
		)
		.join('') +
	'</nav>'

/** Repeated filler, so pages that should scroll actually do. */
function filler(count: number, heading: string) {
	let out = ''
	for (let i = 1; i <= count; i++) {
		out +=
			'<div class="card" style="margin-bottom:10px"><h3>' +
			heading +
			' ' +
			i +
			'</h3><p>Row ' +
			i +
			' of ' +
			count +
			' — generated filler so the page scrolls far enough to test sticky headers, lazy sections and scroll-into-view behaviour.</p></div>'
	}
	return out
}

// ---------------------------------------------------------------------------

const storefront = `
${crumbs('Home', 'Catalog', 'Peripherals')}
<h1>Peripherals</h1>
<p class="lede">Everything that plugs in. Filter by availability, sort the grid, and pick a colourway before adding to the cart.</p>

<div class="row" style="margin-bottom:18px">
  <div class="field" style="margin:0;max-width:200px">
    <label for="sort">Sort by</label>
    <select id="sort" data-kane="sort order">
      <option>Most popular</option>
      <option>Price: low to high</option>
      <option>Price: high to low</option>
      <option>Newest first</option>
      <option>Top rated</option>
    </select>
  </div>
  <div class="row" style="gap:8px;margin-top:18px">
    <span class="switch" id="stock-toggle" role="switch" aria-checked="false" tabindex="0" data-kane="in stock only"></span>
    <span style="font-size:13.5px">In stock only</span>
  </div>
  <div class="tipwrap" style="margin-top:18px">
    <button class="btn ghost" id="help-btn" data-kane="pricing help">${ICON.info} Pricing</button>
    <span class="tip">Click for the pricing note</span>
    <div class="pop" id="help-pop">Prices exclude tax and are held for 30 minutes once an item is in your cart.</div>
  </div>
</div>

<div class="row" style="margin-bottom:16px">
  <span style="font-size:12px;font-weight:600;color:#57606a">Colourway</span>
  <span class="tipwrap"><span class="swatch" style="background:#1f2328" data-kane="colour graphite"></span><span class="tip">Graphite</span></span>
  <span class="tipwrap"><span class="swatch" style="background:#0a69da" data-kane="colour azure"></span><span class="tip">Azure</span></span>
  <span class="tipwrap"><span class="swatch" style="background:#1f883d" data-kane="colour forest"></span><span class="tip">Forest</span></span>
  <span class="tipwrap"><span class="swatch" style="background:#cf222e" data-kane="colour crimson"></span><span class="tip">Crimson</span></span>
</div>

<div class="grid" id="product-grid">
  <div class="card"><div class="thumb" style="width:100%;height:110px;background:#dbeafe"></div><h3 style="margin-top:10px">Wireless mouse</h3><p>Six buttons, 240h battery.</p><div class="row" style="justify-content:space-between;margin-top:10px"><b>$24.99</b><span class="pill ok">In stock</span></div><button class="btn primary" style="width:100%;margin-top:10px" data-kane="add to cart mouse">Add to cart</button></div>
  <div class="card"><div class="thumb" style="width:100%;height:110px;background:#dcfce7"></div><h3 style="margin-top:10px">USB-C hub</h3><p>Seven ports, 100W passthrough.</p><div class="row" style="justify-content:space-between;margin-top:10px"><b>$39.00</b><span class="pill warn">Low stock</span></div><button class="btn primary" style="width:100%;margin-top:10px" data-kane="add to cart hub">Add to cart</button></div>
  <div class="card"><div class="thumb" style="width:100%;height:110px;background:#fee2e2"></div><h3 style="margin-top:10px">Laptop stand</h3><p>Aluminium, six heights.</p><div class="row" style="justify-content:space-between;margin-top:10px"><b>$51.25</b><span class="pill bad">Backorder</span></div><button class="btn" style="width:100%;margin-top:10px" disabled>Notify me</button></div>
  <div class="card"><div class="thumb" style="width:100%;height:110px;background:#fef9c3"></div><h3 style="margin-top:10px">Mechanical keyboard</h3><p>Hot-swap, 75% layout.</p><div class="row" style="justify-content:space-between;margin-top:10px"><b>$89.00</b><span class="pill ok">In stock</span></div><button class="btn primary" style="width:100%;margin-top:10px" data-kane="add to cart keyboard">Add to cart</button></div>
  <div class="card"><div class="thumb" style="width:100%;height:110px;background:#ede9fe"></div><h3 style="margin-top:10px">Webcam 1080p</h3><p>Auto-framing, dual mic.</p><div class="row" style="justify-content:space-between;margin-top:10px"><b>$64.50</b><span class="pill ok">In stock</span></div><button class="btn primary" style="width:100%;margin-top:10px" data-kane="add to cart webcam">Add to cart</button></div>
  <div class="card" id="sk-card"><div class="skeleton" style="width:100%;height:110px"></div><div class="skeleton sk-line" style="width:70%;margin-top:12px"></div><div class="skeleton sk-line" style="width:45%"></div></div>
</div>

<h2>Featured bundle</h2>
${art(210, 'Featured bundle artwork')}
<p class="lede" style="margin-top:12px">Save 15% when the mouse, hub and keyboard ship together. <a class="link" href="#">See what's included</a>.</p>

<h2>More to browse</h2>
${filler(14, 'Category')}
`

const docs = `
${crumbs('Home', 'Resources', 'Documentation')}
<h1>Documentation &amp; downloads</h1>
<p class="lede">Release notes, integration guides and the signed compliance pack. Everything here is versioned against the 24.7 release.</p>

<div class="row" style="margin-bottom:18px">
  <button class="btn primary" id="dl-guide" data-kane="download guide">${ICON.doc} Download guide (PDF)</button>
  <button class="btn" id="dl-compliance" data-kane="download compliance">${ICON.doc} Compliance pack (PDF)</button>
  <span class="row" style="gap:8px"><span class="spinner" id="dl-spin" style="display:none"></span><span class="muted" id="dl-note"></span></span>
</div>

<div class="bar" style="max-width:320px;margin-bottom:6px"><i id="dl-bar" style="width:0%"></i></div>
<p class="muted" id="dl-pct" style="margin-bottom:24px">No download in progress</p>

<h2>Guides</h2>
<div class="list">
  <div class="card"><span class="thumb" style="background:#dbeafe;display:grid;place-items:center;color:#0a69da">${ICON.bolt}</span><div><h3>Getting started</h3><p>Install the SDK, authenticate and run your first test in under ten minutes.</p><a class="link" href="#">Read the guide</a></div></div>
  <div class="card"><span class="thumb" style="background:#dcfce7;display:grid;place-items:center;color:#1a7f37">${ICON.check}</span><div><h3>Assertions reference</h3><p>Every matcher, with the failure output each one produces.</p><a class="link" href="#">Read the guide</a></div></div>
  <div class="card"><span class="thumb" style="background:#fef9c3;display:grid;place-items:center;color:#9a6700">${ICON.box}</span><div><h3>Parallel execution</h3><p>Shard a suite across runners and merge the reports.</p><a class="link" href="#">Read the guide</a></div></div>
  <div class="card" id="doc-skel"><span class="skeleton thumb"></span><div style="flex:1"><div class="skeleton sk-line" style="width:40%"></div><div class="skeleton sk-line" style="width:80%"></div><div class="skeleton sk-line" style="width:60%"></div></div></div>
</div>

<h2>Changelog</h2>
<div class="tl">
  <div class="ev"><time>07 Aug 2026</time><h3>24.7.2 — Inspector</h3><p class="muted">Pick any element and attach a prompt to it.</p></div>
  <div class="ev"><time>22 Jul 2026</time><h3>24.7.1 — Parallel shards</h3><p class="muted">Runs split across up to 32 machines.</p></div>
  <div class="ev"><time>18 Jun 2026</time><h3>24.7.0 — API steps</h3><p class="muted">Call an endpoint as a workflow step.</p></div>
</div>

<h2>Everything else</h2>
${filler(16, 'Reference page')}
`

const dashboard = `
${crumbs('Home', 'Analytics')}
<h1>Run analytics</h1>
<p class="lede">Pass rate and duration across the last 30 days of scheduled runs.</p>

<div class="row" style="margin-bottom:18px">
  <div class="field" style="margin:0;max-width:190px">
    <label for="range">Date range</label>
    <select id="range" data-kane="date range">
      <option>Last 24 hours</option>
      <option selected>Last 7 days</option>
      <option>Last 30 days</option>
      <option>This quarter</option>
      <option>Custom…</option>
    </select>
  </div>
  <div class="row" style="gap:8px;margin-top:18px">
    <span class="switch on" id="live-toggle" role="switch" aria-checked="true" tabindex="0" data-kane="live updates"></span>
    <span style="font-size:13.5px">Live updates</span>
  </div>
  <span class="row" style="gap:6px;margin-top:18px"><span class="spinner"></span><span class="muted">Refreshing…</span></span>
</div>

<div class="grid">
  <div class="card" style="position:relative"><div class="row" style="justify-content:space-between"><h3>Tests run</h3><button class="btn ghost" style="height:24px;padding:0 6px" data-kane="tests run info" onclick="this.parentElement.parentElement.querySelector('.pop').classList.toggle('show')">${ICON.info}</button></div><div style="font-size:28px;font-weight:700">1,284</div><span class="pill ok">+12% vs last week</span><div class="pop">Counts every test that reached a terminal state, including ones that were retried.</div></div>
  <div class="card"><h3>Pass rate</h3><div style="font-size:28px;font-weight:700">94.2%</div><div class="bar" style="margin-top:10px"><i style="width:94%"></i></div></div>
  <div class="card"><h3>Median duration</h3><div style="font-size:28px;font-weight:700">3m 12s</div><div class="bar" style="margin-top:10px"><i style="width:58%;background:#9a6700"></i></div></div>
  <div class="card"><h3>Flaky tests</h3><div style="font-size:28px;font-weight:700">6</div><span class="pill warn">Needs review</span></div>
  <div class="card"><h3>Open issues</h3><div style="font-size:28px;font-weight:700">3</div><span class="pill bad">1 blocking</span></div>
  <div class="card"><div class="skeleton sk-line" style="width:50%"></div><div class="skeleton" style="height:34px;width:70%;margin:8px 0"></div><div class="skeleton sk-line" style="width:40%"></div></div>
</div>

<h2>Duration trend</h2>
<div class="row" style="gap:6px;color:#0a69da;margin-bottom:8px">${ICON.chart}<span class="muted">Rolling 7-day median</span></div>
${art(150, 'Duration trend chart')}

<h2>Recent runs</h2>
${filler(18, 'Scheduled run')}
`

const account = `
${crumbs('Home', 'Settings', 'Account')}
<h1>Account settings</h1>
<p class="lede">Who you are, how we reach you, and what happens when a run fails.</p>

<h2>Profile</h2>
<div class="field"><label for="acc-name">Full name</label><input type="text" id="acc-name" value="Alex Barnes" data-kane="full name"></div>
<div class="field"><label for="acc-email">Email</label><input type="email" id="acc-email" value="alex@example.com" data-kane="email"></div>
<div class="field"><label for="acc-tz">Timezone</label>
  <select id="acc-tz" data-kane="timezone">
    <option>UTC</option><option selected>Asia/Kolkata</option><option>Europe/London</option><option>America/New_York</option><option>America/Los_Angeles</option><option>Australia/Sydney</option>
  </select>
</div>
<div class="field"><label for="acc-bio">Signature</label><textarea id="acc-bio" rows="3" data-kane="signature">Sent from KaneAI</textarea></div>

<h2>Notify me when</h2>
<div class="opts" role="group" aria-label="Notification events">
  <label><input type="checkbox" checked data-kane="notify failure"> A scheduled run fails</label>
  <label><input type="checkbox" checked data-kane="notify flaky"> A test becomes flaky</label>
  <label><input type="checkbox" data-kane="notify pass"> A run passes cleanly</label>
  <label><input type="checkbox" data-kane="notify weekly"> Weekly summary is ready</label>
</div>

<h2>Deliver notifications by</h2>
<div class="opts" role="radiogroup" aria-label="Delivery channel">
  <label><input type="radio" name="channel" checked data-kane="channel email"> Email</label>
  <label><input type="radio" name="channel" data-kane="channel slack"> Slack</label>
  <label><input type="radio" name="channel" data-kane="channel webhook"> Webhook</label>
  <label><input type="radio" name="channel" data-kane="channel none"> Don't notify me</label>
</div>

<h2>Preferences</h2>
<div class="row" style="gap:10px;margin-bottom:10px"><span class="switch on" id="tw-1" role="switch" aria-checked="true" tabindex="0" data-kane="dark mode"></span><span style="font-size:13.5px">Use dark mode in reports</span></div>
<div class="row" style="gap:10px;margin-bottom:10px"><span class="switch" id="tw-2" role="switch" aria-checked="false" tabindex="0" data-kane="auto retry"></span><span style="font-size:13.5px">Retry failed tests once automatically</span></div>
<div class="row" style="gap:10px;margin-bottom:20px">
  <span class="switch on" id="tw-3" role="switch" aria-checked="true" tabindex="0" data-kane="video capture"></span>
  <span style="font-size:13.5px">Capture video for every run</span>
  <span class="tipwrap"><span style="color:#8c959f">${ICON.info}</span><span class="tip">Video adds ~40MB per run</span></span>
</div>

<div class="row">
  <button class="btn primary" data-kane="save changes">Save changes</button>
  <button class="btn" data-kane="discard">Discard</button>
  <button class="btn danger" id="del-btn" data-kane="delete account">Delete account</button>
</div>

<h2>Session history</h2>
${filler(12, 'Sign-in from')}
`

const status = `
${crumbs('Home', 'Status')}
<h1>Service status</h1>
<div class="row" style="margin-bottom:18px"><span class="pill warn">Partial outage</span><span class="muted">Updated 4 minutes ago</span></div>

<div class="list" style="margin-bottom:24px">
  <div class="card" style="align-items:center;justify-content:space-between"><div><h3>Web automation</h3><p>All regions healthy</p></div><span class="pill ok">${ICON.check} Operational</span></div>
  <div class="card" style="align-items:center;justify-content:space-between"><div><h3>Real device cloud</h3><p>Elevated queue times in ap-south-1</p></div><span class="pill warn">Degraded</span></div>
  <div class="card" style="align-items:center;justify-content:space-between"><div><h3>Test analytics</h3><p>Ingestion paused while we replay a backlog</p></div><span class="pill bad">Outage</span></div>
  <div class="card" style="align-items:center;justify-content:space-between"><div><h3>API</h3><p>All endpoints responding</p></div><span class="pill ok">${ICON.check} Operational</span></div>
</div>

<h2>Backlog replay</h2>
<div class="row" style="gap:10px;margin-bottom:6px"><span class="spinner"></span><span class="muted" id="replay-note">Replaying events…</span></div>
<div class="bar" style="max-width:420px"><i id="replay-bar" style="width:12%"></i></div>
<p class="muted" style="margin:6px 0 24px" id="replay-pct">12% complete</p>

<h2>Incident timeline</h2>
<div class="tl">
  <div class="ev"><time>09:12 UTC</time><h3>Investigating</h3><p class="muted">Analytics ingestion is lagging. <button class="btn ghost" id="inc-btn" style="padding:0;height:auto" data-kane="incident detail">Read the full update</button></p></div>
  <div class="ev"><time>09:31 UTC</time><h3>Identified</h3><p class="muted">A stuck consumer group on the events topic.</p></div>
  <div class="ev"><time>09:48 UTC</time><h3>Monitoring</h3><p class="muted">Consumers restarted; the backlog is draining.</p></div>
  <div class="ev"><time>—</time><div class="skeleton sk-line" style="width:30%"></div><div class="skeleton sk-line" style="width:65%"></div></div>
</div>

<h2>Past incidents</h2>
${filler(15, 'Resolved incident')}
`

export const SAMPLE_PAGES: SamplePage[] = [
	{ host: 'shop' + SAMPLE_HOST_SUFFIX, title: 'Peripherals — Storefront', html: storefront },
	{ host: 'docs' + SAMPLE_HOST_SUFFIX, title: 'Documentation & downloads', html: docs },
	{ host: 'dash' + SAMPLE_HOST_SUFFIX, title: 'Run analytics', html: dashboard },
	{ host: 'account' + SAMPLE_HOST_SUFFIX, title: 'Account settings', html: account },
	{ host: 'status' + SAMPLE_HOST_SUFFIX, title: 'Service status', html: status },
]

/** The sample page a host resolves to, or null for the main mock app. */
export function sampleFor(host: string): SamplePage | null {
	return SAMPLE_PAGES.find((p) => p.host === host) ?? null
}

/** A random sample host — what a new tab opens. */
export function randomSampleHost(): string {
	return SAMPLE_PAGES[Math.floor(Math.random() * SAMPLE_PAGES.length)].host
}

/**
 * Behaviour shared by the sample pages: the modal, the popovers, the click
 * tooltips, the toggles, the progress bars, and the PDF the download buttons
 * actually produce.
 */
export const SAMPLE_SCRIPT = `
;(function(){
	// The leading semicolon matters: this block is appended straight after the
	// page's main IIFE, and \`})()\` followed by \`(function(){\` on the next line
	// parses as calling the first IIFE's return value. Without it the whole
	// block dies with "(intermediate value)(...) is not a function".
	// toggles — click or keyboard, and the ARIA state follows
	function flip(el){
		var on = el.classList.toggle('on')
		el.setAttribute('aria-checked', on ? 'true' : 'false')
	}
	document.addEventListener('click', function(e){
		var sw = e.target.closest && e.target.closest('.switch')
		if (sw) flip(sw)
	})
	document.addEventListener('keydown', function(e){
		if (e.key !== ' ' && e.key !== 'Enter') return
		var sw = document.activeElement
		if (sw && sw.classList && sw.classList.contains('switch')) { e.preventDefault(); flip(sw) }
	})

	// a tooltip that opens on click, next to the ones that open on hover
	var helpBtn = document.getElementById('help-btn')
	if (helpBtn) helpBtn.addEventListener('click', function(){
		document.getElementById('help-pop').classList.toggle('show')
	})

	// modal, opened from two different pages
	function openModal(title, body){
		var back = document.createElement('div')
		back.className = 'modal-back show'
		back.id = 'kane-modal'
		back.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + title + '">' +
			'<h3>' + title + '</h3><p>' + body + '</p>' +
			'<div class="row"><button class="btn" data-close="1">Cancel</button>' +
			'<button class="btn danger" data-close="1">Confirm</button></div></div>'
		document.body.appendChild(back)
		back.addEventListener('click', function(e){
			if (e.target === back || (e.target.dataset && e.target.dataset.close)) back.remove()
		})
	}
	var del = document.getElementById('del-btn')
	if (del) del.addEventListener('click', function(){
		openModal('Delete this account?', 'Every test case, run history and report belonging to this account is removed. This cannot be undone.')
	})
	var inc = document.getElementById('inc-btn')
	if (inc) inc.addEventListener('click', function(){
		openModal('Analytics ingestion delayed', 'A consumer group on the events topic stopped advancing its offset at 09:04 UTC. Consumers have been restarted and the backlog is draining at roughly 40k events a minute.')
	})

	// progress bars that actually move
	function drive(barId, pctId, from, note){
		var bar = document.getElementById(barId)
		if (!bar) return
		var pct = from
		setInterval(function(){
			pct = pct >= 100 ? 100 : pct + 1
			bar.style.width = pct + '%'
			var label = document.getElementById(pctId)
			if (label) label.textContent = pct >= 100 ? (note || 'Complete') : pct + '% complete'
		}, 900)
	}
	drive('replay-bar', 'replay-pct', 12, 'Replay complete')

	// skeletons resolve into content, so both states are inspectable
	setTimeout(function(){
		var sk = document.getElementById('sk-card')
		if (sk) sk.innerHTML = '<div class="thumb" style="width:100%;height:110px;background:#e0e7ff"></div>' +
			'<h3 style="margin-top:10px">Desk mat</h3><p>Stitched edge, 900×400.</p>' +
			'<div class="row" style="justify-content:space-between;margin-top:10px"><b>$19.00</b><span class="pill ok">In stock</span></div>' +
			'<button class="btn primary" style="width:100%;margin-top:10px" data-kane="add to cart mat">Add to cart</button>'
		var ds = document.getElementById('doc-skel')
		if (ds) ds.innerHTML = '<span class="thumb" style="background:#ede9fe;display:grid;place-items:center;color:#8250df">&#9679;</span>' +
			'<div><h3>Migration notes</h3><p>Moving a Selenium suite across without rewriting the assertions.</p><a class="link" href="#">Read the guide</a></div>'
	}, 2600)

	/**
	 * A real, openable PDF, assembled here rather than shipped as a blob of
	 * base64 — the byte offsets in the xref table have to match the objects, so
	 * building it is the only way to be sure it is valid.
	 */
	function makePdf(title){
		var objs = [
			'<</Type/Catalog/Pages 2 0 R>>',
			'<</Type/Pages/Kids[3 0 R]/Count 1>>',
			'<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
			null, // contents, filled below
			'<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
		]
		var text = 'BT /F1 16 Tf 36 140 Td (' + title.replace(/[()\\\\]/g, '') + ') Tj ET\\n' +
			'BT /F1 10 Tf 36 112 Td (Sample document generated by the KaneAI prototype.) Tj ET'
		objs[3] = '<</Length ' + text.length + '>>stream\\n' + text + '\\nendstream'

		var out = '%PDF-1.4\\n'
		var offsets = []
		for (var i = 0; i < objs.length; i++) {
			offsets.push(out.length)
			out += (i + 1) + ' 0 obj' + objs[i] + 'endobj\\n'
		}
		var xref = out.length
		out += 'xref\\n0 ' + (objs.length + 1) + '\\n0000000000 65535 f \\n'
		for (var j = 0; j < offsets.length; j++) {
			out += ('0000000000' + offsets[j]).slice(-10) + ' 00000 n \\n'
		}
		out += 'trailer<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\\nstartxref\\n' + xref + '\\n%%EOF'
		return new Blob([out], { type: 'application/pdf' })
	}

	function download(name, title){
		var spin = document.getElementById('dl-spin')
		var note = document.getElementById('dl-note')
		var bar = document.getElementById('dl-bar')
		var pct = document.getElementById('dl-pct')
		if (spin) spin.style.display = 'inline-block'
		if (note) note.textContent = 'Preparing ' + name
		var p = 0
		var iv = setInterval(function(){
			p += 12
			if (bar) bar.style.width = Math.min(p, 100) + '%'
			if (pct) pct.textContent = Math.min(p, 100) + '% of ' + name
			if (p < 100) return
			clearInterval(iv)
			if (spin) spin.style.display = 'none'
			if (note) note.textContent = 'Saved ' + name
			var url = URL.createObjectURL(makePdf(title))
			var a = document.createElement('a')
			a.href = url
			a.download = name
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(function(){ URL.revokeObjectURL(url) }, 2000)
		}, 260)
	}
	var g = document.getElementById('dl-guide')
	if (g) g.addEventListener('click', function(){ download('kane-getting-started.pdf', 'Getting started with KaneAI') })
	var c = document.getElementById('dl-compliance')
	if (c) c.addEventListener('click', function(){ download('kane-compliance-pack.pdf', 'KaneAI compliance pack') })
})()
`
