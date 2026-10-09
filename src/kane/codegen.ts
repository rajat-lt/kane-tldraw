import { Editor, TLShapeId } from 'tldraw'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'

/**
 * Turning the canvas into runnable test code.
 *
 * The canvas is walked in execution order (following connections from the
 * starting card, not left-to-right position), data cards become variables at
 * the top of the test, and every other card becomes one or more statements
 * emitted by the chosen language/framework profile.
 *
 * Card targets are natural language ("“Sign in” button", "Email field") because
 * that is what the author typed — so the emitted locators are text/label
 * locators built from that phrase, with the phrase kept verbatim in the string.
 * That is the honest translation: no selector is invented that the canvas
 * doesn't contain.
 */

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export type CodeLanguage = 'javascript' | 'typescript' | 'python' | 'java' | 'csharp'
export type CodeFramework = 'playwright' | 'selenium' | 'webdriverio'

export const LANGUAGES: { value: CodeLanguage; label: string; frameworks: CodeFramework[] }[] = [
	{ value: 'javascript', label: 'JavaScript', frameworks: ['playwright', 'selenium', 'webdriverio'] },
	{ value: 'typescript', label: 'TypeScript', frameworks: ['playwright'] },
	{ value: 'python', label: 'Python', frameworks: ['playwright', 'selenium'] },
	{ value: 'java', label: 'Java', frameworks: ['selenium'] },
	{ value: 'csharp', label: 'C#', frameworks: ['selenium'] },
]

export const FRAMEWORK_LABELS: Record<CodeFramework, string> = {
	playwright: 'Playwright',
	selenium: 'Selenium',
	webdriverio: 'WebdriverIO',
}

/** Every framework on offer, in the order the picker lists them. */
export const ALL_FRAMEWORKS: CodeFramework[] = ['playwright', 'selenium', 'webdriverio']

/**
 * Official brand marks, served from the projects' own icon sets rather than
 * redrawn here. devicon carries the multi-colour originals for the ones Simple
 * Icons doesn't publish — Playwright, Java and C# are all 404 on Simple Icons,
 * so those come from devicon; the rest use Simple Icons' single-colour CDN with
 * an explicit brand colour. Every URL below was checked to return a real SVG.
 */
const DEVICON = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons'
const SIMPLE = 'https://cdn.simpleicons.org'

export const FRAMEWORK_LOGOS: Record<CodeFramework, string> = {
	playwright: `${DEVICON}/playwright/playwright-original.svg`,
	selenium: `${SIMPLE}/selenium/43B02A`,
	webdriverio: `${SIMPLE}/webdriverio/EA5906`,
}

export const LANGUAGE_LOGOS: Record<CodeLanguage, string> = {
	javascript: `${SIMPLE}/javascript/F7DF1E`,
	typescript: `${SIMPLE}/typescript/3178C6`,
	python: `${SIMPLE}/python/3776AB`,
	java: `${DEVICON}/java/java-original.svg`,
	csharp: `${DEVICON}/csharp/csharp-original.svg`,
}

/** Frameworks available for a language — the picker never offers a dead pair. */
export function frameworksFor(language: CodeLanguage): CodeFramework[] {
	return LANGUAGES.find((l) => l.value === language)?.frameworks ?? ['playwright']
}

// ---------------------------------------------------------------------------
// Reading the canvas
// ---------------------------------------------------------------------------

interface OpenStep { kind: 'open'; url: string }
interface ClickStep { kind: 'click'; target: string; clickType: 'single' | 'double' | 'right' }
interface InputStep { kind: 'input'; target: string; text: string; pressEnter: boolean }
interface IfElseStep { kind: 'ifelse'; conditions: string[] }
interface WhileStep { kind: 'while'; condition: string; maxIterations: number }
export type CodeStep = OpenStep | ClickStep | InputStep | IfElseStep | WhileStep

export interface CodeVariable {
	kind: 'parameter' | 'secret' | 'totp' | 'variable'
	name: string
	value: string
}

export interface CanvasProgram {
	variables: CodeVariable[]
	steps: CodeStep[]
}

const DATA_KINDS = ['parameter', 'secret', 'totp', 'variable']

/** Which output port carries the main flow onwards, per card type. */
function forwardPort(type: string): string {
	if (type === 'ifelse') return 'out0'
	if (type === 'while') return 'body'
	return 'output'
}

/**
 * Cards in execution order. Starts from cards with no incoming connection and
 * follows the forward port, so the code matches what a run would actually do.
 * Unreached cards are appended in canvas order rather than silently dropped.
 */
function orderedNodes(editor: Editor): NodeShape[] {
	const nodes = editor
		.getCurrentPageShapes()
		.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
		.sort((a, b) => a.x - b.x || a.y - b.y)

	const byId = new Map(nodes.map((n) => [n.id, n]))
	const seen = new Set<TLShapeId>()
	const out: NodeShape[] = []

	const walk = (node: NodeShape) => {
		if (seen.has(node.id)) return
		seen.add(node.id)
		out.push(node)
		const type = (node.props.node as { type: string }).type
		const next = getNodePortConnections(editor, node)
			.filter((c) => c.terminal === 'start' && c.ownPortId === forwardPort(type))
			.sort((a, b) => a.order - b.order)
		for (const c of next) {
			const target = byId.get(c.connectedShapeId as TLShapeId)
			if (target) walk(target)
		}
	}

	for (const node of nodes) {
		const hasIncoming = getNodePortConnections(editor, node).some((c) => c.terminal === 'end')
		if (!hasIncoming) walk(node)
	}
	// anything left over (islands, cards only reachable through an else branch)
	for (const node of nodes) walk(node)
	return out
}

/** Read the canvas into a language-independent program. */
export function readCanvas(editor: Editor): CanvasProgram {
	const variables: CodeVariable[] = []
	const steps: CodeStep[] = []

	// Two cards can carry the same variable name — the runtime lets the later
	// one win, and the emitted code has to agree: declaring the same name twice
	// wouldn't compile. Nameless cards can't be referenced, so they're skipped.
	const byName = new Map<string, CodeVariable>()

	for (const shape of orderedNodes(editor)) {
		const node = shape.props.node as Record<string, unknown> & { type: string }
		if (DATA_KINDS.includes(node.type)) {
			const name = String(node.name ?? '').trim()
			if (!name) continue
			byName.set(name, {
				kind: node.type as CodeVariable['kind'],
				name,
				value: String(node.value ?? ''),
			})
			continue
		}
		switch (node.type) {
			case 'open':
				steps.push({ kind: 'open', url: String(node.url ?? '') })
				break
			case 'click':
				steps.push({
					kind: 'click',
					target: String(node.target ?? ''),
					clickType: (node.clickType as ClickStep['clickType']) ?? 'single',
				})
				break
			case 'input':
				steps.push({
					kind: 'input',
					target: String(node.target ?? ''),
					text: String(node.text ?? ''),
					pressEnter: Boolean(node.pressEnter),
				})
				break
			case 'ifelse': {
				const blocks = (node.blocks as { nl?: string; left?: string; op?: string; right?: string }[]) ?? []
				const mode = node.mode
				steps.push({
					kind: 'ifelse',
					conditions: blocks
						.map((b) =>
							mode === 'nl'
								? String(b.nl ?? '').trim()
								: `${b.left ?? ''} ${b.op ?? ''} ${b.right ?? ''}`.trim()
						)
						.filter(Boolean),
				})
				break
			}
			case 'while':
				steps.push({
					kind: 'while',
					condition: String(node.condition ?? ''),
					maxIterations: Number(node.maxIterations ?? 10),
				})
				break
		}
	}

	variables.push(...byName.values())
	return { variables, steps }
}

/**
 * A fingerprint of everything the generated code depends on. Compared against
 * the fingerprint captured at generation time to tell whether the code has gone
 * stale — moving a card around doesn't count, changing what it does does.
 */
export function canvasSignature(editor: Editor): string {
	const { variables, steps } = readCanvas(editor)
	return JSON.stringify({ variables, steps })
}

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------

/** Everything a language/framework pair needs to write a test. */
interface Profile {
	/** shiki language id for highlighting */
	highlight: string
	filename: string
	/** lines above the test body */
	header(title: string, vars: CodeVariable[]): string[]
	/** indentation depth the body starts at */
	bodyIndent: number
	indent: string
	open(url: string): string[]
	click(target: string, clickType: ClickStep['clickType']): string[]
	input(target: string, text: string, pressEnter: boolean): string[]
	ifElse(conditions: string[]): string[]
	whileLoop(condition: string, max: number): string[]
	footer(): string[]
}

/** Interpolate `{{name}}` references into the target language's syntax. */
function interpolate(text: string, wrap: (name: string) => string): string {
	return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name) => wrap(String(name)))
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const qq = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** A safe identifier for a variable name the author typed. */
function ident(name: string, fallback: string) {
	const cleaned = name.replace(/[^\w]/g, '_').replace(/^(\d)/, '_$1')
	return cleaned || fallback
}

const url = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`)

const jsVars = (vars: CodeVariable[], keyword: string) =>
	vars.map((v, i) => {
		const name = ident(v.name, `value${i + 1}`)
		if (v.kind === 'secret') return `${keyword} ${name} = process.env.${name.toUpperCase()} ?? ${q(v.value)}`
		if (v.kind === 'totp') return `${keyword} ${name}Secret = ${q(v.value)} // TOTP shared key`
		return `${keyword} ${name} = ${q(v.value)}`
	})

const jsText = (t: string) => interpolate(t, (n) => `\${${ident(n, 'value')}}`)

/** JS/TS + Playwright. */
function playwrightJs(ts: boolean): Profile {
	const kw = 'const'
	return {
		highlight: ts ? 'typescript' : 'javascript',
		filename: ts ? 'checkout-regression.spec.ts' : 'checkout-regression.spec.js',
		bodyIndent: 1,
		indent: '  ',
		header: (title, vars) => [
			`import { test, expect } from '@playwright/test'`,
			'',
			...jsVars(vars, kw),
			...(vars.length ? [''] : []),
			`test(${q(title)}, async ({ page }) => {`,
		],
		open: (u) => [`await page.goto(\`${jsText(url(u))}\`)`],
		click: (target, kind) => {
			const locator = `page.getByText(${q(target)}, { exact: false })`
			if (kind === 'double') return [`await ${locator}.dblclick()`]
			if (kind === 'right') return [`await ${locator}.click({ button: 'right' })`]
			return [`await ${locator}.click()`]
		},
		input: (target, text, enter) => {
			const lines = [`await page.getByLabel(${q(target)}).fill(\`${jsText(text)}\`)`]
			if (enter) lines.push(`await page.keyboard.press('Enter')`)
			return lines
		},
		ifElse: (conds) => [
			`// ${conds[0] || 'condition'}`,
			`if (await page.getByText(${q(conds[0] ?? '')}).isVisible()) {`,
			`  // then branch`,
			`} else {`,
			`  // else branch`,
			`}`,
		],
		whileLoop: (cond, max) => [
			`for (let i = 0; i < ${max}; i++) {`,
			`  // ${cond || 'loop while the condition holds'}`,
			`  if (!(await page.getByText(${q(cond)}).isVisible())) break`,
			`}`,
		],
		footer: () => [`})`],
	}
}

/** JS + Selenium WebDriver. */
const seleniumJs: Profile = {
	highlight: 'javascript',
	filename: 'checkout-regression.test.js',
	bodyIndent: 1,
	indent: '  ',
	header: (title, vars) => [
		`const { Builder, By, Key, until } = require('selenium-webdriver')`,
		'',
		...jsVars(vars, 'const'),
		'',
		`describe(${q(title)}, function () {`,
		`  let driver`,
		'',
		`  before(async () => {`,
		`    driver = await new Builder().forBrowser('chrome').build()`,
		`  })`,
		'',
		`  after(async () => driver.quit())`,
		'',
		`  it('runs the recorded steps', async function () {`,
	],
	open: (u) => [`await driver.get(\`${jsText(url(u))}\`)`],
	click: (target, kind) => {
		const by = `By.xpath(${q(`//*[contains(normalize-space(.), ${JSON.stringify(target)})]`)})`
		const el = `await driver.wait(until.elementLocated(${by}), 10000)`
		if (kind === 'double') return [`const el = ${el}`, `await driver.actions().doubleClick(el).perform()`]
		if (kind === 'right') return [`const el = ${el}`, `await driver.actions().contextClick(el).perform()`]
		return [`await (${el}).click()`]
	},
	input: (target, text, enter) => {
		const by = `By.xpath(${q(`//*[@aria-label=${JSON.stringify(target)} or @placeholder=${JSON.stringify(target)}]`)})`
		const value = `\`${jsText(text)}\`${enter ? ' + Key.ENTER' : ''}`
		return [`await (await driver.wait(until.elementLocated(${by}), 10000)).sendKeys(${value})`]
	},
	ifElse: (conds) => [
		`// ${conds[0] || 'condition'}`,
		`const matched = await driver.findElements(By.xpath(${q(`//*[contains(., ${JSON.stringify(conds[0] ?? '')})]`)}))`,
		`if (matched.length > 0) {`,
		`  // then branch`,
		`} else {`,
		`  // else branch`,
		`}`,
	],
	whileLoop: (cond, max) => [
		`for (let i = 0; i < ${max}; i++) {`,
		`  // ${cond || 'loop while the condition holds'}`,
		`  const more = await driver.findElements(By.xpath(${q(`//*[contains(., ${JSON.stringify(cond)})]`)}))`,
		`  if (more.length === 0) break`,
		`}`,
	],
	footer: () => [`  })`, `})`],
}

/** JS + WebdriverIO. */
const webdriverio: Profile = {
	highlight: 'javascript',
	filename: 'checkout-regression.e2e.js',
	bodyIndent: 2,
	indent: '  ',
	header: (title, vars) => [
		...jsVars(vars, 'const'),
		'',
		`describe(${q(title)}, () => {`,
		`  it('runs the recorded steps', async () => {`,
	],
	open: (u) => [`await browser.url(\`${jsText(url(u))}\`)`],
	click: (target, kind) => {
		const el = `await $(${q(`*=${target}`)})`
		if (kind === 'double') return [`await (${el}).doubleClick()`]
		if (kind === 'right') return [`await (${el}).click({ button: 'right' })`]
		return [`await (${el}).click()`]
	},
	input: (target, text, enter) => {
		const lines = [`await (await $(${q(`[aria-label="${target}"]`)})).setValue(\`${jsText(text)}\`)`]
		if (enter) lines.push(`await browser.keys('Enter')`)
		return lines
	},
	ifElse: (conds) => [
		`// ${conds[0] || 'condition'}`,
		`if (await (await $(${q(`*=${conds[0] ?? ''}`)})).isDisplayed()) {`,
		`  // then branch`,
		`} else {`,
		`  // else branch`,
		`}`,
	],
	whileLoop: (cond, max) => [
		`for (let i = 0; i < ${max}; i++) {`,
		`  // ${cond || 'loop while the condition holds'}`,
		`  if (!(await (await $(${q(`*=${cond}`)})).isDisplayed())) break`,
		`}`,
	],
	footer: () => [`  })`, `})`],
}

const pyVars = (vars: CodeVariable[]) =>
	vars.map((v, i) => {
		const name = ident(v.name, `value_${i + 1}`).toLowerCase()
		if (v.kind === 'secret') return `${name} = os.environ.get(${q(name.toUpperCase())}, ${q(v.value)})`
		if (v.kind === 'totp') return `${name}_secret = ${q(v.value)}  # TOTP shared key`
		return `${name} = ${q(v.value)}`
	})

const pyText = (t: string) => {
	const hasRef = /\{\{/.test(t)
	const body = interpolate(t, (n) => `{${ident(n, 'value').toLowerCase()}}`)
	return hasRef ? `f${q(body)}` : q(body)
}

/** Python + Playwright. */
const playwrightPy: Profile = {
	highlight: 'python',
	filename: 'test_checkout_regression.py',
	bodyIndent: 1,
	indent: '    ',
	header: (_title, vars) => [
		`import os`,
		`from playwright.sync_api import sync_playwright, expect`,
		'',
		...pyVars(vars),
		'',
		`def test_checkout_regression(page):`,
	],
	open: (u) => [`page.goto(${pyText(url(u))})`],
	click: (target, kind) => {
		const locator = `page.get_by_text(${q(target)}, exact=False)`
		if (kind === 'double') return [`${locator}.dblclick()`]
		if (kind === 'right') return [`${locator}.click(button="right")`]
		return [`${locator}.click()`]
	},
	input: (target, text, enter) => {
		const lines = [`page.get_by_label(${q(target)}).fill(${pyText(text)})`]
		if (enter) lines.push(`page.keyboard.press("Enter")`)
		return lines
	},
	ifElse: (conds) => [
		`# ${conds[0] || 'condition'}`,
		`if page.get_by_text(${q(conds[0] ?? '')}).is_visible():`,
		`    pass  # then branch`,
		`else:`,
		`    pass  # else branch`,
	],
	whileLoop: (cond, max) => [
		`for _ in range(${max}):`,
		`    # ${cond || 'loop while the condition holds'}`,
		`    if not page.get_by_text(${q(cond)}).is_visible():`,
		`        break`,
	],
	footer: () => [],
}

/** Python + Selenium. */
const seleniumPy: Profile = {
	highlight: 'python',
	filename: 'test_checkout_regression.py',
	bodyIndent: 1,
	indent: '    ',
	header: (_title, vars) => [
		`import os`,
		`from selenium import webdriver`,
		`from selenium.webdriver.common.by import By`,
		`from selenium.webdriver.common.keys import Keys`,
		'',
		...pyVars(vars),
		'',
		`def test_checkout_regression():`,
		`    driver = webdriver.Chrome()`,
	],
	open: (u) => [`driver.get(${pyText(url(u))})`],
	click: (target, kind) => {
		const by = `driver.find_element(By.XPATH, ${q(`//*[contains(normalize-space(.), ${JSON.stringify(target)})]`)})`
		if (kind === 'double') return [`webdriver.ActionChains(driver).double_click(${by}).perform()`]
		if (kind === 'right') return [`webdriver.ActionChains(driver).context_click(${by}).perform()`]
		return [`${by}.click()`]
	},
	input: (target, text, enter) => {
		const by = `driver.find_element(By.CSS_SELECTOR, ${q(`[aria-label="${target}"]`)})`
		return [`${by}.send_keys(${pyText(text)}${enter ? ' + Keys.ENTER' : ''})`]
	},
	ifElse: (conds) => [
		`# ${conds[0] || 'condition'}`,
		`if driver.find_elements(By.XPATH, ${q(`//*[contains(., ${JSON.stringify(conds[0] ?? '')})]`)}):`,
		`    pass  # then branch`,
		`else:`,
		`    pass  # else branch`,
	],
	whileLoop: (cond, max) => [
		`for _ in range(${max}):`,
		`    # ${cond || 'loop while the condition holds'}`,
		`    if not driver.find_elements(By.XPATH, ${q(`//*[contains(., ${JSON.stringify(cond)})]`)}):`,
		`        break`,
	],
	footer: () => [`    driver.quit()`],
}

/** Java + Selenium. */
const seleniumJava: Profile = {
	highlight: 'java',
	filename: 'CheckoutRegressionTest.java',
	bodyIndent: 2,
	indent: '    ',
	header: (_title, vars) => [
		`import org.openqa.selenium.By;`,
		`import org.openqa.selenium.Keys;`,
		`import org.openqa.selenium.WebDriver;`,
		`import org.openqa.selenium.chrome.ChromeDriver;`,
		`import org.junit.jupiter.api.Test;`,
		'',
		`public class CheckoutRegressionTest {`,
		...vars.map((v, i) => {
			const name = ident(v.name, `value${i + 1}`)
			const value =
				v.kind === 'secret'
					? `System.getenv().getOrDefault(${qq(name.toUpperCase())}, ${qq(v.value)})`
					: qq(v.value)
			return `    private static final String ${name.toUpperCase()} = ${value};`
		}),
		'',
		`    @Test`,
		`    void runsTheRecordedSteps() {`,
		`        WebDriver driver = new ChromeDriver();`,
	],
	open: (u) => [`driver.get(${qq(url(u))});`],
	click: (target, kind) => {
		const by = `driver.findElement(By.xpath(${qq(`//*[contains(normalize-space(.), ${JSON.stringify(target)})]`)}))`
		if (kind === 'double') return [`new Actions(driver).doubleClick(${by}).perform();`]
		if (kind === 'right') return [`new Actions(driver).contextClick(${by}).perform();`]
		return [`${by}.click();`]
	},
	input: (target, text, enter) => [
		`driver.findElement(By.cssSelector(${qq(`[aria-label="${target}"]`)})).sendKeys(${qq(text)}${
			enter ? ', Keys.ENTER' : ''
		});`,
	],
	ifElse: (conds) => [
		`// ${conds[0] || 'condition'}`,
		`if (!driver.findElements(By.xpath(${qq(`//*[contains(., ${JSON.stringify(conds[0] ?? '')})]`)})).isEmpty()) {`,
		`    // then branch`,
		`} else {`,
		`    // else branch`,
		`}`,
	],
	whileLoop: (cond, max) => [
		`for (int i = 0; i < ${max}; i++) {`,
		`    // ${cond || 'loop while the condition holds'}`,
		`    if (driver.findElements(By.xpath(${qq(`//*[contains(., ${JSON.stringify(cond)})]`)})).isEmpty()) break;`,
		`}`,
	],
	footer: () => [`        driver.quit();`, `    }`, `}`],
}

/** C# + Selenium. */
const seleniumCsharp: Profile = {
	highlight: 'csharp',
	filename: 'CheckoutRegressionTests.cs',
	bodyIndent: 3,
	indent: '    ',
	header: (_title, vars) => [
		`using OpenQA.Selenium;`,
		`using OpenQA.Selenium.Chrome;`,
		`using NUnit.Framework;`,
		'',
		`public class CheckoutRegressionTests`,
		`{`,
		...vars.map((v, i) => {
			const name = ident(v.name, `value${i + 1}`)
			const pascal = name.charAt(0).toUpperCase() + name.slice(1)
			return `    private const string ${pascal} = ${qq(v.value)};`
		}),
		'',
		`    [Test]`,
		`    public void RunsTheRecordedSteps()`,
		`    {`,
		`        IWebDriver driver = new ChromeDriver();`,
	],
	open: (u) => [`driver.Navigate().GoToUrl(${qq(url(u))});`],
	click: (target, kind) => {
		const by = `driver.FindElement(By.XPath(${qq(`//*[contains(normalize-space(.), ${JSON.stringify(target)})]`)}))`
		if (kind === 'double') return [`new Actions(driver).DoubleClick(${by}).Perform();`]
		if (kind === 'right') return [`new Actions(driver).ContextClick(${by}).Perform();`]
		return [`${by}.Click();`]
	},
	input: (target, text, enter) => [
		`driver.FindElement(By.CssSelector(${qq(`[aria-label="${target}"]`)})).SendKeys(${qq(text)}${
			enter ? ' + Keys.Enter' : ''
		});`,
	],
	ifElse: (conds) => [
		`// ${conds[0] || 'condition'}`,
		`if (driver.FindElements(By.XPath(${qq(`//*[contains(., ${JSON.stringify(conds[0] ?? '')})]`)})).Count > 0)`,
		`{`,
		`    // then branch`,
		`}`,
		`else`,
		`{`,
		`    // else branch`,
		`}`,
	],
	whileLoop: (cond, max) => [
		`for (var i = 0; i < ${max}; i++)`,
		`{`,
		`    // ${cond || 'loop while the condition holds'}`,
		`    if (driver.FindElements(By.XPath(${qq(`//*[contains(., ${JSON.stringify(cond)})]`)})).Count == 0) break;`,
		`}`,
	],
	footer: () => [`        driver.Quit();`, `    }`, `}`],
}

function profileFor(language: CodeLanguage, framework: CodeFramework): Profile {
	if (language === 'typescript') return playwrightJs(true)
	if (language === 'javascript') {
		if (framework === 'selenium') return seleniumJs
		if (framework === 'webdriverio') return webdriverio
		return playwrightJs(false)
	}
	if (language === 'python') return framework === 'selenium' ? seleniumPy : playwrightPy
	if (language === 'java') return seleniumJava
	return seleniumCsharp
}

export interface GeneratedCode {
	code: string
	/** shiki language id */
	highlight: string
	filename: string
}

/** Emit the whole test for the chosen target. */
export function generateCode(
	program: CanvasProgram,
	language: CodeLanguage,
	framework: CodeFramework,
	title: string
): GeneratedCode {
	const profile = profileFor(language, framework)
	const pad = profile.indent.repeat(profile.bodyIndent)
	const lines = [...profile.header(title, program.variables)]

	if (program.steps.length === 0) {
		lines.push(`${pad}// No steps on the canvas yet.`)
	}

	for (const step of program.steps) {
		let emitted: string[]
		switch (step.kind) {
			case 'open':
				emitted = profile.open(step.url)
				break
			case 'click':
				emitted = profile.click(step.target, step.clickType)
				break
			case 'input':
				emitted = profile.input(step.target, step.text, step.pressEnter)
				break
			case 'ifelse':
				emitted = profile.ifElse(step.conditions)
				break
			case 'while':
				emitted = profile.whileLoop(step.condition, step.maxIterations)
				break
		}
		for (const line of emitted) lines.push(line ? `${pad}${line}` : '')
	}

	lines.push(...profile.footer())
	return { code: lines.join('\n'), highlight: profile.highlight, filename: profile.filename }
}
