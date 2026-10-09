import { NetworkEntry } from './DevTools'

/**
 * Everything the Network detail pane shows about one request, derived from the
 * little the mock page reports (method, url, status, type, size, timing).
 *
 * The page emits traffic, not wire formats — asking it to spell out twenty
 * headers per request would bury the behaviour it exists to demonstrate. So the
 * headers are reconstructed here, following what Chrome shows for a request of
 * that kind: HTTP/2 pseudo-headers first, the fetch-metadata set, and a
 * response block sorted the way Chrome sorts it.
 *
 * Everything is a pure function of the entry, so a re-render never reshuffles
 * a request id or a remote address under the reader.
 */

export interface HeaderRow {
	name: string
	value: string
}

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const STATUS_TEXT: Record<number, string> = {
	200: 'OK',
	201: 'Created',
	204: 'No Content',
	301: 'Moved Permanently',
	302: 'Found',
	304: 'Not Modified',
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	429: 'Too Many Requests',
	500: 'Internal Server Error',
	502: 'Bad Gateway',
	503: 'Service Unavailable',
}

export function statusText(status: number): string {
	return STATUS_TEXT[status] ?? ''
}

/** FNV-1a — a stable number per string, for ids and addresses that must not move. */
function hash(input: string): number {
	let h = 2166136261
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return Math.abs(h)
}

/** Split an entry's url into the host it went to and the path it asked for. */
function parts(entry: NetworkEntry): { host: string; path: string; url: string } {
	const raw = entry.url || '/'
	const fallbackHost = entry.host || 'example.com'
	if (/^https?:\/\//i.test(raw)) {
		const rest = raw.replace(/^https?:\/\//i, '')
		const slash = rest.indexOf('/')
		const host = slash === -1 ? rest : rest.slice(0, slash)
		const path = slash === -1 ? '/' : rest.slice(slash)
		return { host, path, url: `https://${host}${path}` }
	}
	// a bare path belongs to the page's own host …
	if (raw.startsWith('/')) {
		return { host: fallbackHost, path: raw, url: `https://${fallbackHost}${raw}` }
	}
	// … anything else is a host, optionally with a path (`app.example.com/login`)
	const slash = raw.indexOf('/')
	const host = slash === -1 ? raw : raw.slice(0, slash)
	const path = slash === -1 ? '/' : raw.slice(slash)
	return { host, path, url: `https://${host}${path}` }
}

/** A stable, plausible edge address for a host. */
function remoteAddress(host: string): string {
	const h = hash(host)
	return `104.18.${h % 128}.${(h >> 7) % 200}:443`
}

function requestId(entry: NetworkEntry): string {
	return hash(`${entry.id}:${entry.url}:${entry.at}`).toString(16).padStart(8, '0').slice(0, 12)
}

const ACCEPT: Record<string, string> = {
	document:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
	stylesheet: 'text/css,*/*;q=0.1',
	script: '*/*',
	xhr: 'application/json, text/plain, */*',
}

const SEC_FETCH_DEST: Record<string, string> = {
	document: 'document',
	stylesheet: 'style',
	script: 'script',
	xhr: 'empty',
}

const CONTENT_TYPE: Record<string, string> = {
	document: 'text/html; charset=utf-8',
	stylesheet: 'text/css; charset=utf-8',
	script: 'application/javascript; charset=utf-8',
	xhr: 'application/json; charset=utf-8',
}

const CACHE_CONTROL: Record<string, string> = {
	document: 'no-cache, no-store, must-revalidate',
	stylesheet: 'public, max-age=31536000, immutable',
	script: 'public, max-age=31536000, immutable',
	xhr: 'no-store',
}

/** Chrome's "General" block, in Chrome's order. */
export function generalRows(entry: NetworkEntry): HeaderRow[] {
	const { host, url } = parts(entry)
	const text = statusText(entry.status)
	return [
		{ name: 'Request URL', value: url },
		{ name: 'Request Method', value: entry.method },
		{ name: 'Status Code', value: text ? `${entry.status} ${text}` : String(entry.status) },
		{ name: 'Remote Address', value: remoteAddress(host) },
		{ name: 'Referrer Policy', value: 'strict-origin-when-cross-origin' },
	]
}

export function requestHeaders(entry: NetworkEntry): HeaderRow[] {
	const { host, path } = parts(entry)
	const rows: HeaderRow[] = [
		// HTTP/2 pseudo-headers, which is how Chrome renders them
		{ name: ':authority', value: host },
		{ name: ':method', value: entry.method },
		{ name: ':path', value: path },
		{ name: ':scheme', value: 'https' },
		{ name: 'accept', value: ACCEPT[entry.type] ?? '*/*' },
		{ name: 'accept-encoding', value: 'gzip, deflate, br, zstd' },
		{ name: 'accept-language', value: 'en-US,en;q=0.9' },
	]
	if (entry.reqBody) {
		rows.push(
			{ name: 'content-length', value: String(new Blob([entry.reqBody]).size) },
			{ name: 'content-type', value: 'application/json' }
		)
	}
	rows.push(
		{ name: 'cookie', value: 'lt_session=8f3c2b7d9ab1; lt_device=desktop' },
		{ name: 'origin', value: `https://${host}` },
		{ name: 'referer', value: `https://${host}/` },
		{ name: 'sec-ch-ua', value: '"Chromium";v="128", "Not;A=Brand";v="24"' },
		{ name: 'sec-ch-ua-mobile', value: '?0' },
		{ name: 'sec-ch-ua-platform', value: '"macOS"' },
		{ name: 'sec-fetch-dest', value: SEC_FETCH_DEST[entry.type] ?? 'empty' },
		{ name: 'sec-fetch-mode', value: entry.type === 'document' ? 'navigate' : 'cors' },
		{ name: 'sec-fetch-site', value: 'same-origin' },
		{ name: 'user-agent', value: USER_AGENT }
	)
	return rows
}

export function responseHeaders(entry: NetworkEntry): HeaderRow[] {
	const rows: HeaderRow[] = [
		{ name: 'cache-control', value: CACHE_CONTROL[entry.type] ?? 'no-cache' },
		{ name: 'date', value: new Date(entry.at).toUTCString() },
		{ name: 'server', value: 'cloudflare' },
		{ name: 'strict-transport-security', value: 'max-age=31536000; includeSubDomains' },
		{ name: 'x-content-type-options', value: 'nosniff' },
		{ name: 'x-request-id', value: requestId(entry) },
	]
	// a 204 carries no body, so it advertises no encoding, length or type
	if (entry.status !== 204) {
		rows.push(
			{ name: 'content-encoding', value: 'br' },
			{ name: 'content-length', value: String(entry.size) },
			{ name: 'content-type', value: CONTENT_TYPE[entry.type] ?? 'application/octet-stream' },
			{ name: 'vary', value: 'Accept-Encoding' }
		)
	}
	if (entry.type === 'stylesheet' || entry.type === 'script') {
		rows.push({ name: 'accept-ranges', value: 'bytes' })
	}
	if (entry.url.includes('/auth/login')) {
		rows.push({
			name: 'set-cookie',
			value: 'lt_session=8f3c2b7d9ab1; Path=/; HttpOnly; Secure; SameSite=Lax',
		})
	}
	// Chrome lists response headers alphabetically
	return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** `?e=click` → the pairs Chrome shows under "Query String Parameters". */
export function queryParams(entry: NetworkEntry): HeaderRow[] {
	const q = entry.url.indexOf('?')
	if (q === -1) return []
	return entry.url
		.slice(q + 1)
		.split('&')
		.filter(Boolean)
		.map((pair) => {
			const eq = pair.indexOf('=')
			const name = eq === -1 ? pair : pair.slice(0, eq)
			const value = eq === -1 ? '' : pair.slice(eq + 1)
			return { name: decodeURIComponent(name), value: decodeURIComponent(value) }
		})
}

/**
 * What came back. Requests that carry a real payload report it themselves;
 * for the rest this stands in something of the right shape, so the Response
 * tab is never just blank.
 */
export function responseBody(entry: NetworkEntry): string {
	if (entry.resBody) return entry.resBody
	if (entry.status === 204) return ''
	const { host, path } = parts(entry)
	switch (entry.type) {
		case 'document':
			return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>${host}</title>\n    <link rel="stylesheet" href="/assets/app.css" />\n  </head>\n  <body>\n    <div id="root"></div>\n    <script src="/assets/app.js" defer></script>\n  </body>\n</html>`
		case 'stylesheet':
			return `*{box-sizing:border-box;margin:0}\nbody{background:#f6f8fa;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}\n.nav{height:56px;background:#fff;border-bottom:1px solid #e2e6ea}\n.card{background:#fff;border:1px solid #e2e6ea;border-radius:12px;padding:24px}\n/* … ${entry.size.toLocaleString()} bytes total */`
		case 'script':
			return `(function(){"use strict";\n  var app=document.getElementById("root");\n  function boot(){ render(app, routeFor(location.pathname)); }\n  document.readyState==="loading" ? addEventListener("DOMContentLoaded",boot) : boot();\n})();\n/* … ${entry.size.toLocaleString()} bytes total */`
		default:
			return JSON.stringify({ ok: entry.status < 400, path }, null, 2)
	}
}
