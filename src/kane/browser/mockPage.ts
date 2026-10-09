/**
 * Self-contained mock web app rendered into the browser iframe via srcdoc.
 * Same approach as the previous Kane build (always renders, no X-Frame-Options
 * problems), extended with a message bridge:
 *
 *  parent → iframe:  { type: 'kane-action', action }  — animate a run action
 *                    { type: 'kane-nav', url }        — switch the mock view
 *  iframe → parent:  { type: 'kane-event', event }    — user interactions
 *                                                       (for Record mode)
 */
import { SAMPLE_CSS, SAMPLE_SCRIPT, sampleFor } from './samplePages'

export function mockPageHtml(host: string) {
	const brand = (host.split('.')[0] || 'acme').replace(/^www$/, 'acme')
	// A `*.demo.test` host renders one of the sample pages instead of the mock
	// app. Everything below — the console/network instrumentation, the run
	// effects, the Inspector overlay — is shared by both.
	const sample = sampleFor(host)
	return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
	*{box-sizing:border-box;margin:0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif}
	body{background:#f6f8fa;color:#1f2328;overflow-x:hidden}
	.nav{height:56px;background:#fff;border-bottom:1px solid #e2e6ea;display:flex;align-items:center;gap:16px;padding:0 24px}
	.brand{font-weight:700;font-size:16px;text-transform:capitalize}
	.links{display:flex;gap:18px;margin-left:auto;color:#57606a;font-size:14px;align-items:center}
	.links span{cursor:pointer}
	.hero{max-width:720px;margin:48px auto;padding:0 24px;text-align:center}
	h1{font-size:28px;letter-spacing:-.02em;margin-bottom:10px}
	p.sub{color:#57606a;font-size:15px;line-height:1.5;margin-bottom:24px}
	.card{background:#fff;border:1px solid #e2e6ea;border-radius:12px;padding:24px;max-width:380px;margin:0 auto;text-align:left}
	label{display:block;font-size:12px;font-weight:600;color:#57606a;margin:12px 0 6px}
	input{width:100%;height:38px;border:1px solid #d6dce2;border-radius:8px;padding:0 12px;font-size:14px;background:#fff}
	button.primary{width:100%;height:40px;margin-top:18px;background:#1f883d;color:#fff;border:0;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer}
	.foot{text-align:center;color:#8c959f;font-size:12px;margin-top:36px}
	.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;max-width:840px;margin:24px auto;padding:0 24px}
	.tile{background:#fff;border:1px solid #e2e6ea;border-radius:10px;padding:16px}
	.tile h3{font-size:14px;margin-bottom:6px}
	.tile p{font-size:12px;color:#57606a}
	.tile .price{margin-top:10px;font-weight:700;font-size:14px}
	.tile button{margin-top:10px;width:100%;height:32px;border:1px solid #d6dce2;background:#fff;border-radius:8px;font-size:12.5px;cursor:pointer}
	.searchwrap{max-width:840px;margin:20px auto 0;padding:0 24px}
	.searchwrap input{max-width:420px}
	.view{display:none}
	.view.active{display:block}
	.statbar{display:flex;gap:12px;max-width:840px;margin:24px auto;padding:0 24px}
	.stat{flex:1;background:#fff;border:1px solid #e2e6ea;border-radius:10px;padding:14px}
	.stat b{display:block;font-size:20px}
	.stat span{font-size:12px;color:#57606a}
	/* ---- Kane run-visualization effects ---- */
	.kane-ring{outline:3px solid #0a69da !important;outline-offset:2px;border-radius:6px;transition:outline .1s}
	/* the button is down: pressed in, and a warmer ring than a tap gets */
	.kane-held{outline-color:#8250df !important;transform:scale(.97);transition:transform .12s ease}
	.kane-ripple{position:fixed;width:14px;height:14px;border-radius:50%;background:rgba(10,105,218,.45);border:2px solid #0a69da;transform:translate(-50%,-50%);pointer-events:none;z-index:9999;animation:kane-rip .55s ease-out forwards}
	@keyframes kane-rip{to{width:56px;height:56px;opacity:0}}
	.kane-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2328;color:#fff;font-size:12.5px;padding:8px 14px;border-radius:999px;z-index:9999;opacity:0;transition:opacity .18s}
	.kane-toast.on{opacity:1}
	/* Text Inspector: an overlay that outlines whatever text is under the pointer */
	.kane-inspect *{cursor:crosshair !important}
	.kane-ins-box{position:fixed;pointer-events:none;z-index:10000;border:2px solid #8250df;background:rgba(130,80,223,.10);border-radius:3px;transition:all .08s linear}
	.kane-ins-tag{position:fixed;pointer-events:none;z-index:10001;background:#8250df;color:#fff;font:600 10px/1.6 ui-monospace,Menlo,monospace;padding:1px 6px;border-radius:3px;white-space:nowrap}
	.kane-cursor{position:fixed;width:18px;height:18px;z-index:9998;pointer-events:none;transition:left .45s cubic-bezier(.4,0,.2,1),top .45s cubic-bezier(.4,0,.2,1);left:50%;top:50%}
	${sample ? SAMPLE_CSS : ''}
</style></head>
<body>
	<div class="nav">
		<span class="brand">◆ ${brand}</span>
		<span class="links">
			<span data-kane="pricing">Pricing</span>
			<span data-kane="docs">Docs</span>
			<span data-kane="cart checkout" id="nav-cart">Cart</span>
			<span data-kane="logout sign out" id="nav-logout" style="display:none">Log out</span>
		</span>
	</div>

	${sample ? '<div class="view active" id="view-sample"><div class="wrap">' + sample.html + '</div></div>' : ''}

	<div class="view" id="view-login">
		<div class="hero">
			<h1>Welcome back</h1>
			<p class="sub">Sign in to continue to your ${host} workspace.</p>
			<div class="card">
				<label>Email</label><input id="f-email" data-kane="email username user" placeholder="you@company.com"/>
				<label>Password</label><input id="f-password" data-kane="password pass" type="password" placeholder="••••••••"/>
				<label>2FA code <span style="font-weight:400">(optional)</span></label><input id="f-otp" data-kane="otp code 2fa totp" placeholder="6-digit code"/>
				<button class="primary" id="f-signin" data-kane="sign in login submit log in">Sign in</button>
			</div>
			<div class="foot">© ${host} — mock page for the KaneAI prototype</div>
		</div>
	</div>

	<div class="view" id="view-dashboard">
		<div class="searchwrap"><label>Search</label><input id="f-search" data-kane="search find query" placeholder="Search projects…"/></div>
		<div class="statbar">
			<div class="stat"><b>128</b><span>Tests run</span></div>
			<div class="stat"><b>94%</b><span>Pass rate</span></div>
			<div class="stat"><b>6</b><span>Open issues</span></div>
		</div>
		<div class="grid" id="dash-grid"></div>
	</div>

	<div class="view" id="view-cart">
		<div class="hero" style="text-align:left;max-width:840px">
			<h1>Your cart</h1>
			<div class="grid" style="padding:0;margin:16px 0" id="cart-grid"></div>
			<button class="primary" style="max-width:280px" data-kane="checkout place order">Checkout</button>
		</div>
	</div>

	<div class="view" id="view-landing">
		<div class="hero">
			<h1>Ship quality, faster</h1>
			<p class="sub">The ${brand} platform for modern teams.</p>
			<div class="card" style="text-align:center">
				<button class="primary" data-kane="get started cta start">Get started free</button>
			</div>
		</div>
	</div>

	<div class="kane-toast" id="kane-toast"></div>
	<div class="kane-ins-box" id="kane-ins-box" style="display:none"></div>
	<div class="kane-ins-tag" id="kane-ins-tag" style="display:none"></div>
	<svg class="kane-cursor" id="kane-cursor" viewBox="0 0 24 24"><path d="M4 2l16 7.6-7 2.2-2.7 6.8L4 2z" fill="#1f2328" stroke="#fff" stroke-width="1.4"/></svg>

<script>
(function(){
	var post = function(event){ try{ parent.postMessage({type:'kane-event', event:event}, '*') }catch(e){} }
	var raw = function(type, payload){ try{ parent.postMessage({type:type, payload:payload}, '*') }catch(e){} }

	// ---- devtools instrumentation --------------------------------------------
	// console.* is genuinely patched, so anything this page logs shows up in the
	// Console pane. Network entries are emitted by the page's own mock traffic
	// (it makes no real requests) — see net() calls below.
	;['log','info','warn','error','debug'].forEach(function(level){
		var original = console[level] ? console[level].bind(console) : function(){}
		console[level] = function(){
			var args = Array.prototype.slice.call(arguments)
			var text = args.map(function(a){
				try { return typeof a === 'string' ? a : JSON.stringify(a) } catch(e){ return String(a) }
			}).join(' ')
			raw('kane-console', { level: level, text: text, at: Date.now() })
			original.apply(null, args)
		}
	})
	window.addEventListener('error', function(e){
		raw('kane-console', { level:'error', text: e.message + ' (' + (e.filename||'page') + ':' + (e.lineno||0) + ')', at: Date.now() })
	})

	var reqSeq = 0
	// The "extra" argument carries whatever only the caller knows — the JSON a
	// POST sent, the body that came back. Everything else about a request (its
	// headers, its remote address) is derived on the parent side, in
	// netDetail.ts.
	function net(method, path, status, type, size, ms, extra){
		var payload = {
			id: ++reqSeq, method: method, url: path, status: status,
			type: type, size: size, ms: ms, at: Date.now(), host: host
		}
		if (extra) { for (var k in extra) payload[k] = extra[k] }
		raw('kane-network', payload)
	}
	// what "loading this page" would look like on the wire
	function emitPageLoad(url){
		net('GET', url, 200, 'document', 4210, 38 + Math.round(Math.random()*40))
		net('GET', '/assets/app.css', 200, 'stylesheet', 18240, 12 + Math.round(Math.random()*18))
		net('GET', '/assets/app.js', 200, 'script', 96410, 24 + Math.round(Math.random()*30))
		net('GET', '/api/session', 200, 'xhr', 312, 60 + Math.round(Math.random()*70), {
			resBody: JSON.stringify({
				authenticated: false,
				plan: 'team',
				features: { recorder: true, devtools: true },
				region: 'us-west-2'
			}, null, 2)
		})
	}

	// ---- views ----------------------------------------------------------------
	function viewFor(url){
		url = (url||'').toLowerCase()
		if (url.indexOf('login')>=0 || url.indexOf('signin')>=0 || url.indexOf('forgot')>=0) return 'login'
		if (url.indexOf('dash')>=0 || url.indexOf('app.')===0 || url.indexOf('result')>=0) return 'dashboard'
		if (url.indexOf('cart')>=0 || url.indexOf('shop')>=0 || url.indexOf('checkout')>=0) return 'cart'
		return 'landing'
	}
	function show(view){
		// the sample pages have no login/dashboard/cart views to switch between
		if (document.getElementById('view-sample')) return
		var views = document.querySelectorAll('.view')
		for (var i=0;i<views.length;i++) views[i].classList.remove('active')
		var el = document.getElementById('view-'+view)
		if (el) el.classList.add('active')
		document.getElementById('nav-logout').style.display = view==='dashboard' ? '' : 'none'
	}

	// seed grids
	var names=['Smoke suite','Checkout E2E','Auth flows','Search relevance','Mobile web','API contract']
	var grid=document.getElementById('dash-grid')
	for (var i=0;i<6;i++){ var t=document.createElement('div');t.className='tile';t.innerHTML='<h3>'+names[i]+'</h3><p>Last run 2h ago</p>';grid.appendChild(t) }
	var items=[['Wireless mouse','$24.99'],['USB-C hub','$39.00'],['Laptop stand','$51.25']]
	var cg=document.getElementById('cart-grid')
	for (var j=0;j<3;j++){ var c=document.createElement('div');c.className='tile';c.innerHTML='<h3>'+items[j][0]+'</h3><p class="price">'+items[j][1]+'</p><button data-kane="remove">Remove</button>';cg.appendChild(c) }

	// ---- effects --------------------------------------------------------------
	var cursor=document.getElementById('kane-cursor')
	function moveCursor(x,y){ cursor.style.left=x+'px'; cursor.style.top=y+'px' }
	function ripple(x,y){ var r=document.createElement('div');r.className='kane-ripple';r.style.left=x+'px';r.style.top=y+'px';document.body.appendChild(r);setTimeout(function(){r.remove()},600) }
	var toastTimer=null
	function toast(msg){
		var t=document.getElementById('kane-toast');t.textContent=msg;t.classList.add('on')
		clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('on')},1600)
	}
	function ring(el){ el.classList.add('kane-ring'); setTimeout(function(){el.classList.remove('kane-ring')},900) }

	function findTarget(text){
		text=(text||'').toLowerCase().replace(/[“”"']/g,'')
		var tokens=text.split(/[^a-z0-9]+/).filter(Boolean)
		var els=document.querySelectorAll('.view.active [data-kane]')
		var best=null,bestScore=0
		for (var i=0;i<els.length;i++){
			var kws=(els[i].getAttribute('data-kane')||'').split(' ')
			var score=0
			for (var k=0;k<tokens.length;k++){ if (kws.indexOf(tokens[k])>=0) score++ }
			if (score>bestScore){best=els[i];bestScore=score}
		}
		if (best) return best
		// fallback: button/link containing the text
		var all=document.querySelectorAll('.view.active button, .view.active input, .view.active span[data-kane]')
		for (var m=0;m<all.length;m++){
			var label=(all[m].placeholder||all[m].textContent||'').toLowerCase()
			if (text && label.indexOf(tokens[0]||'')>=0) return all[m]
		}
		return null
	}

	function centerOf(el){ var b=el.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2} }

	function doClick(el,clickType,holdMs){
		var p=centerOf(el)
		moveCursor(p.x,p.y)
		setTimeout(function(){
			ripple(p.x,p.y); if (clickType==='double') setTimeout(function(){ripple(p.x,p.y)},160)
			// a hold keeps the ring on for as long as the button is down, so the
			// duration is something you can see rather than only read
			if (clickType==='hold'){ hold(el, holdMs||800) } else { ring(el) }
			if (el.id==='f-signin'){ setTimeout(function(){ navigate('app.lambdatest.com/dashboard') },500) }
			if ((el.getAttribute('data-kane')||'').indexOf('checkout')>=0){ toast('Order placed ✓') }
			if ((el.getAttribute('data-kane')||'').indexOf('logout')>=0){ setTimeout(function(){ navigate(host+'/login') },400) }
		},480)
	}

	function hold(el, ms){
		el.classList.add('kane-ring','kane-held')
		setTimeout(function(){ el.classList.remove('kane-ring','kane-held') }, ms)
	}

	/**
	 * Scroll a region. The container is whatever the card named — a selector, or
	 * nothing for the page. A percentage is of the scroller's own visible size,
	 * which is what "scroll down 50%" means to anyone reading the step.
	 */
	function doScroll(direction, amount, unit, container){
		var el = null
		if (container && container !== 'the page'){
			try { el = document.querySelector(container) } catch(e){ el = null }
			if (el && el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) el = null
		}
		var horizontal = direction === 'left' || direction === 'right'
		var viewport = el
			? (horizontal ? el.clientWidth : el.clientHeight)
			: (horizontal ? window.innerWidth : window.innerHeight)
		var distance = unit === 'px' ? Number(amount) : (Number(amount)/100) * viewport
		if (direction === 'up' || direction === 'left') distance = -distance
		var options = horizontal ? {left:distance, behavior:'smooth'} : {top:distance, behavior:'smooth'}
		if (el) el.scrollBy(options); else window.scrollBy(options)
		toast('Scrolled ' + direction + ' ' + amount + unit)
	}

	function doType(el,text){
		var p=centerOf(el)
		moveCursor(p.x,p.y)
		setTimeout(function(){
			ring(el); el.focus()
			var i=0; el.value=''
			var iv=setInterval(function(){
				el.value=text.slice(0,++i)
				if (i>=text.length){ clearInterval(iv) }
			},28)
		},480)
	}

	var host=${JSON.stringify(host)}
	function navigate(url){
		show(viewFor(url))
		console.info('[router] navigate →', url)
		emitPageLoad(url)
		post({kind:'navigated', url:url, label:'Navigated to '+url})
	}

	// first paint of this document
	console.log('[kane] page ready on', host)
	emitPageLoad(host)

	// ---- parent messages ------------------------------------------------------
	window.addEventListener('message',function(e){
		var d=e.data||{}
		if (d.type==='kane-nav'){ show(viewFor(d.url)) }
		if (d.type==='kane-inspect'){
			inspecting = !!d.on
			document.body.classList.toggle('kane-inspect', inspecting)
			if (!inspecting) paintOutline(null)
		}
		if (d.type==='kane-action'){
			var a=d.action||{}
			if (a.kind==='navigate'){ show(viewFor(a.url)) }
			else if (a.kind==='click'){ var el=findTarget(a.target); if (el) doClick(el,a.clickType,a.holdMs); else toast('Click: '+(a.target||'?')) }
			else if (a.kind==='scroll'){ doScroll(a.direction||'down', a.amount||50, a.unit||'%', a.container||'') }
			else if (a.kind==='type'){ var el2=findTarget(a.target); if (el2 && 'value' in el2) doType(el2,a.text||''); else toast('Type into: '+(a.target||'?')) }
			else if (a.kind==='press'){ toast('Pressed '+(a.text||'key'));
				var active=document.activeElement
				if (active && active.id==='f-search'){ toast('Searching…') }
				if (active && active.id==='f-password'){ setTimeout(function(){ navigate('app.lambdatest.com/dashboard') },400) }
			}
			else if (a.kind==='flash'){ toast(a.label||'…') }
			// an API card's request joins the page's own traffic in the Network pane
			else if (a.kind==='api'){
				toast((a.method||'GET')+' '+(a.url||''))
				var extra = {}
				if (a.text) extra.reqBody = a.text
				extra.resBody = JSON.stringify({ ok: (a.status||200) < 400, method: a.method||'GET' }, null, 2)
				net(a.method||'GET', a.url||'/', a.status||200, 'xhr', 384, 120 + Math.round(Math.random()*160), extra)
			}
		}
	})

	// ---- Inspector -------------------------------------------------------------
	// Toggled from the browser toolbar. While it's on, hovering outlines whatever
	// element is under the pointer — any element, not only ones that own text —
	// and clicking picks it instead of acting on the page, so you can target a
	// button, an image or a whole card without triggering what it normally does.
	//
	// The pick is marked with data-kane-picked so the parent can find the very
	// same element in this document and run its own inspection helpers on it;
	// posting a selector and re-querying it would be ambiguous the moment two
	// elements share a class.
	var inspecting = false
	var insBox = document.getElementById('kane-ins-box')
	var insTag = document.getElementById('kane-ins-tag')

	/** Does this element own visible text of its own (not just via children)? */
	function ownText(el){
		var own = ''
		for (var i = 0; i < el.childNodes.length; i++) {
			if (el.childNodes[i].nodeType === 3) own += el.childNodes[i].nodeValue
		}
		return own.trim()
	}

	/**
	 * The element to target. Anything under the pointer is fair game, but the
	 * inspector's own overlay never is, and neither is a bare <body>: picking the
	 * document is never what someone meant.
	 */
	function elementAt(el){
		while (el && el.nodeType !== 1) el = el.parentElement
		if (!el || el === document.body || el === document.documentElement) return null
		if (el.className && String(el.className).indexOf('kane-ins-') === 0) return null
		return el
	}

	/** A CSS path good enough to identify the element again. */
	function cssPath(el){
		if (el.id) return '#' + el.id
		var parts = []
		var node = el
		while (node && node !== document.body && parts.length < 4) {
			var part = node.tagName.toLowerCase()
			if (node.getAttribute && node.getAttribute('data-kane')) {
				part += '[data-kane="' + node.getAttribute('data-kane') + '"]'
				parts.unshift(part)
				break
			}
			if (node.className && typeof node.className === 'string') {
				var cls = node.className.trim().split(/\s+/).filter(function(c){ return c.indexOf('kane-') !== 0 })[0]
				if (cls) part += '.' + cls
			}
			parts.unshift(part)
			node = node.parentElement
		}
		return parts.join(' > ')
	}

	/**
	 * An absolute XPath, indexed by position among same-tag siblings. Class names
	 * churn between builds; position does not, which is why the card stores this
	 * alongside the CSS path.
	 */
	function xPath(el){
		if (el.id) return '//*[@id="' + el.id + '"]'
		var parts = []
		var node = el
		while (node && node.nodeType === 1 && node !== document.documentElement) {
			var index = 1
			var sib = node.previousElementSibling
			while (sib) {
				if (sib.tagName === node.tagName) index++
				sib = sib.previousElementSibling
			}
			parts.unshift(node.tagName.toLowerCase() + '[' + index + ']')
			node = node.parentElement
		}
		return '/html/' + parts.join('/')
	}

	/**
	 * A short human label, so a card reads as something rather than as a tag.
	 * data-kane is checked early: it is the page's own name for the element and
	 * is exactly what a controls-without-text (a toggle, a swatch) needs.
	 */
	function labelFor(el){
		var aria = el.getAttribute('aria-label')
		if (aria) return aria
		var kane = el.getAttribute('data-kane')
		if (kane) return kane
		var text = ownText(el) || (el.textContent || '').trim()
		if (text) return text.slice(0, 60)
		if (el.placeholder) return el.placeholder
		if (el.alt) return el.alt
		var role = el.getAttribute('role')
		if (role) return role + ' (' + el.tagName.toLowerCase() + ')'
		if (el.type) return el.tagName.toLowerCase() + ' (' + el.type + ')'
		return el.tagName.toLowerCase()
	}

	function describe(el){
		var cs = getComputedStyle(el)
		var r = el.getBoundingClientRect()
		return {
			text: (el.textContent || '').trim().slice(0, 300),
			// only elements that carry their own text get type properties read off
			// them — font metrics on a wrapper div describe nothing
			hasText: !!ownText(el),
			label: labelFor(el),
			tag: el.tagName.toLowerCase(),
			role: el.getAttribute('role') || '',
			selector: cssPath(el),
			xpath: xPath(el),
			classes: typeof el.className === 'string' ? el.className.trim() : '',
			fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
			fontSize: cs.fontSize,
			fontWeight: cs.fontWeight,
			lineHeight: cs.lineHeight,
			letterSpacing: cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing,
			color: cs.color,
			background: cs.backgroundColor,
			textAlign: cs.textAlign,
			textTransform: cs.textTransform,
			display: cs.display,
			width: Math.round(r.width),
			height: Math.round(r.height),
			// viewport coordinates, for anchoring the popup over the element
			rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
		}
	}

	function paintOutline(el){
		if (!el) { insBox.style.display = 'none'; insTag.style.display = 'none'; return }
		var r = el.getBoundingClientRect()
		insBox.style.display = 'block'
		insBox.style.left = r.left + 'px'
		insBox.style.top = r.top + 'px'
		insBox.style.width = r.width + 'px'
		insBox.style.height = r.height + 'px'
		insTag.style.display = 'block'
		insTag.textContent = el.tagName.toLowerCase() + ' · ' + Math.round(r.width) + '×' + Math.round(r.height)
		// above the box unless that would clip off the top of the viewport
		var top = r.top - 20
		insTag.style.top = (top < 2 ? r.bottom + 4 : top) + 'px'
		insTag.style.left = r.left + 'px'
	}

	document.addEventListener('mousemove', function(e){
		if (!inspecting) return
		paintOutline(elementAt(e.target))
	}, true)

	document.addEventListener('click', function(e){
		if (!inspecting) return
		var el = elementAt(e.target)
		if (!el) return
		// the page must not act on this click — it's a pick, not an interaction
		e.preventDefault()
		e.stopPropagation()
		var previous = document.querySelector('[data-kane-picked]')
		if (previous) previous.removeAttribute('data-kane-picked')
		el.setAttribute('data-kane-picked', '1')
		raw('kane-inspect-pick', describe(el))
	}, true)

	// keyboard and form controls must not react either while picking
	;['mousedown','mouseup','dblclick','submit','keydown'].forEach(function(type){
		document.addEventListener(type, function(e){
			if (!inspecting) return
			e.preventDefault()
			e.stopPropagation()
		}, true)
	})

	// ---- record-mode listeners ------------------------------------------------
	document.addEventListener('click',function(e){
		var el=e.target.closest('[data-kane]')
		if (!el || el.tagName==='INPUT') return
		var label=(el.textContent||'').trim()||el.getAttribute('data-kane')
		post({kind:'click', target:label, label:'Clicked “'+label+'”'})
		console.log('[ui] click:', label)
		if (el.id==='f-signin'){
			// a sign-in click posts credentials, then routes on success
			net('POST', '/api/auth/login', 200, 'xhr', 486, 180 + Math.round(Math.random()*140), {
				reqBody: JSON.stringify({
					email: (document.getElementById('f-email')||{}).value || 'you@company.com',
					password: '••••••••',
					otp: (document.getElementById('f-otp')||{}).value || null,
					remember: true
				}, null, 2),
				resBody: JSON.stringify({
					token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock',
					expiresIn: 3600,
					user: { id: 'usr_8123', name: 'Alex Barnes', org: 'LambdaTest' }
				}, null, 2)
			})
			setTimeout(function(){ navigate('app.lambdatest.com/dashboard') },350)
		} else if (el.id==='f-checkout'){
			net('POST', '/api/cart/checkout', 201, 'xhr', 742, 220 + Math.round(Math.random()*180), {
				reqBody: JSON.stringify({
					items: [{ sku: 'WM-2201', qty: 1 }, { sku: 'HUB-USBC', qty: 1 }],
					currency: 'USD',
					guest: true
				}, null, 2),
				resBody: JSON.stringify({
					orderId: 'ord_44192',
					status: 'confirmed',
					total: 63.99,
					currency: 'USD'
				}, null, 2)
			})
		} else {
			net('GET', '/api/track?e=click', 204, 'xhr', 0, 18 + Math.round(Math.random()*22))
		}
	},true)

	// A scroll is recorded as one step per gesture, not per frame: the position
	// is sampled when the wheel goes quiet, and what moved is read off the event
	// itself — the element that scrolled is the container, and no guessing about
	// which of the page's scrollers the user meant is involved.
	var scrollFrom = {}
	var scrollTimer = null
	function scrollKey(el){
		if (el === document || el === document.documentElement || el === document.body) return ''
		if (el.id) return '#' + el.id
		var cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/)
			.filter(function(c){ return c && c.indexOf('kane-') !== 0 })[0]
		return cls ? el.tagName.toLowerCase() + '.' + cls : el.tagName.toLowerCase()
	}
	function scrollPos(el){
		if (el === document || el === document.documentElement || el === document.body) {
			return { x: window.scrollX, y: window.scrollY, w: window.innerWidth, h: window.innerHeight }
		}
		return { x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight }
	}
	document.addEventListener('scroll', function(e){
		if (inspecting) return
		var el = e.target
		var key = scrollKey(el)
		if (scrollFrom[key] === undefined) scrollFrom[key] = scrollPos(el)
		clearTimeout(scrollTimer)
		scrollTimer = setTimeout(function(){
			var from = scrollFrom[key]
			delete scrollFrom[key]
			if (!from) return
			var to = scrollPos(el)
			var dx = to.x - from.x
			var dy = to.y - from.y
			if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
			var horizontal = Math.abs(dx) > Math.abs(dy)
			var delta = horizontal ? dx : dy
			var viewport = horizontal ? from.w : from.h
			var percent = viewport ? Math.round((Math.abs(delta) / viewport) * 100) : 0
			post({
				kind: 'scrolled',
				direction: horizontal ? (delta > 0 ? 'right' : 'left') : (delta > 0 ? 'down' : 'up'),
				// a gesture worth less than a tenth of the viewport reads better in
				// pixels; anything bigger reads better as a share of the view
				unit: percent >= 10 ? '%' : 'px',
				amount: percent >= 10 ? percent : Math.abs(Math.round(delta)),
				container: key,
				label: 'Scrolled ' + (key || 'the page')
			})
		}, 260)
	}, true)

	var typeTimers={}
	document.addEventListener('input',function(e){
		var el=e.target
		if (!el.matches('input')) return
		var key=el.id||el.placeholder
		clearTimeout(typeTimers[key])
		typeTimers[key]=setTimeout(function(){
			var label=(el.previousElementSibling&&el.previousElementSibling.textContent)||el.placeholder||'field'
			post({kind:'type', target:label, text:el.value, label:'Typed into '+label})
		},800)
	},true)

	// A sample page is its own single view; the app's router would hide it.
	var isSample = ${JSON.stringify(!!sampleFor(host))}
	if (!isSample) show(viewFor(${JSON.stringify(host)}))
})()
${sample ? SAMPLE_SCRIPT : ''}
</script>
</body></html>`
}
