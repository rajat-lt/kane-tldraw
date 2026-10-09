import { BookOpen, ClipboardList, Plus, StickyNote, Ticket } from 'lucide-react'
import { useState } from 'react'
import {
	PromptInputActionAddAttachments,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuItem,
	PromptInputActionMenuTrigger,
} from '@/components/ai-elements/prompt-input'
import {
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { SOURCE_LOGOS } from '../kane/catalog'
import { ContextItemKind } from '../kane/KaneAppContext'

/**
 * The `+` menu: attach a file, or link something from the tools a QA team
 * already keeps its work in.
 *
 * It lives here rather than inside the omnibox because a card's own AI composer
 * offers the same thing — one menu, one list of sources, so the two can never
 * drift into offering different things.
 *
 * Grouped by source rather than flat: with four sources and five recents each,
 * a flat menu was twenty unlabelled lines and no way to tell a Confluence page
 * from a Notion one at a glance. The source is the item you choose, and its
 * recents are behind it.
 */
export const LINK_SOURCES: {
	kind: ContextItemKind
	label: string
	/** Fallback mark, used if the brand SVG can't be fetched. */
	icon: typeof Ticket
	items: string[]
}[] = [
	{
		kind: 'jira',
		label: 'Jira',
		icon: Ticket,
		items: [
			'KANE-142 · Login flaky on retry',
			'KANE-137 · Cart total rounding error',
			'KANE-121 · 2FA timeout on slow network',
			'KANE-118 · Checkout 500 on guest order',
			'KANE-104 · Search returns stale results',
		],
	},
	{
		kind: 'ado',
		label: 'Azure DevOps',
		icon: ClipboardList,
		items: [
			'AB#4821 · Checkout smoke pack',
			'AB#4779 · Search relevance regression',
			'AB#4750 · Mobile web nav broken',
			'AB#4712 · Flaky 2FA suite',
		],
	},
	{
		kind: 'confluence',
		label: 'Confluence',
		icon: BookOpen,
		items: [
			'QA · Regression checklist',
			'Release 24.7 · Test plan',
			'Payments · Test data matrix',
			'Onboarding · Manual QA runbook',
		],
	},
	{
		kind: 'notion',
		label: 'Notion',
		icon: StickyNote,
		items: [
			'Test strategy — Q3',
			'Login flow · edge cases',
			'Bug triage board',
			'Release checklist template',
		],
	},
]

/**
 * A source's brand mark. It falls back to a lucide icon if the SVG can't be
 * loaded, so an offline demo still shows something in every row.
 */
export function SourceMark({
	kind,
	fallback,
}: {
	kind: ContextItemKind
	fallback: typeof Ticket
}) {
	const [failed, setFailed] = useState(false)
	const src = SOURCE_LOGOS[kind as keyof typeof SOURCE_LOGOS]
	const Fallback = fallback
	if (!src || failed) return <Fallback size={16} />
	return (
		<img
			className="source-logo"
			src={src}
			alt=""
			aria-hidden
			width={15}
			height={15}
			onError={() => setFailed(true)}
		/>
	)
}

export function AttachMenu({
	disabled,
	onLink,
	size = 18,
}: {
	disabled?: boolean
	/** Called when one of the linked sources' recents is picked. */
	onLink: (kind: ContextItemKind, label: string) => void
	size?: number
}) {
	return (
		<PromptInputActionMenu>
			<PromptInputActionMenuTrigger disabled={disabled}>
				<Plus size={size} />
			</PromptInputActionMenuTrigger>
			<PromptInputActionMenuContent align="start" className="plus-menu">
				<DropdownMenuLabel className="plus-menu-heading">Attach</DropdownMenuLabel>
				<PromptInputActionAddAttachments label="Files from this computer" />
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="plus-menu-heading">Link from</DropdownMenuLabel>
				{LINK_SOURCES.map((source) => (
					<DropdownMenuSub key={source.kind}>
						<DropdownMenuSubTrigger className="plus-menu-item">
							<SourceMark kind={source.kind} fallback={source.icon} />
							<span>{source.label}</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="plus-submenu">
							<DropdownMenuLabel className="plus-menu-heading">
								Recently opened
							</DropdownMenuLabel>
							{source.items.map((item) => (
								<PromptInputActionMenuItem
									key={item}
									onSelect={() => onLink(source.kind, item)}
								>
									<SourceMark kind={source.kind} fallback={source.icon} />
									<span>{item}</span>
								</PromptInputActionMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				))}
			</PromptInputActionMenuContent>
		</PromptInputActionMenu>
	)
}
