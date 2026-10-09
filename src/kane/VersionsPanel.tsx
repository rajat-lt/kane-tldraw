import classNames from 'classnames'
import { Check, History, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatStamp } from '../utils/formatDate'
import { TestCaseVersion, useKaneApp } from './KaneAppContext'

/**
 * Versions — every saved version of this test case, newest first.
 *
 * A version carries three facts and they are all here: which version it is,
 * when it was cut, and who cut it. Selecting one opens what was saved with it;
 * the name can be changed afterwards, because what a version turns out to have
 * been is often only clear once the next one exists.
 */

function initialsOf(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('')
}

function VersionRow({
	entry,
	isCurrent,
	isOpen,
	onOpen,
}: {
	entry: TestCaseVersion
	isCurrent: boolean
	isOpen: boolean
	onOpen: () => void
}) {
	const { renameVersion, pushToast } = useKaneApp()
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(entry.name)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!editing) return
		setDraft(entry.name)
		const id = window.setTimeout(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		}, 20)
		return () => window.clearTimeout(id)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editing])

	const commit = () => {
		const next = draft.trim()
		setEditing(false)
		if (!next || next === entry.name) return
		renameVersion(entry.version, next)
		pushToast(`v${entry.version} renamed to “${next}”`, 'success')
	}

	return (
		<div
			className={classNames('ver-row', {
				'ver-row_open': isOpen,
				'ver-row_current': isCurrent,
			})}
		>
			<button
				className="ver-main"
				aria-expanded={isOpen}
				aria-label={`View version ${entry.version}`}
				onClick={onOpen}
			>
				<span className="ver-badge">v{entry.version}</span>
				<span className="ver-text">
					{editing ? (
						<input
							ref={inputRef}
							className="ver-rename"
							value={draft}
							onChange={(e) => setDraft(e.currentTarget.value)}
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => {
								e.stopPropagation()
								if (e.key === 'Enter') commit()
								if (e.key === 'Escape') setEditing(false)
							}}
							onBlur={commit}
						/>
					) : (
						<span className="ver-name">{entry.name}</span>
					)}
					<span className="ver-meta">
						<span className="ver-stamp">{formatStamp(entry.at)}</span>
						<span className="ver-dot">·</span>
						<span className="ver-author">
							<span className="ver-avatar" aria-hidden>
								{initialsOf(entry.author)}
							</span>
							{entry.author}
						</span>
					</span>
				</span>
				{isCurrent && <span className="ver-current">Current</span>}
			</button>
			{editing ? (
				<span className="ver-rename-actions">
					<button className="icon-btn" aria-label="Save name" onMouseDown={commit}>
						<Check size={14} />
					</button>
					<button
						className="icon-btn"
						aria-label="Cancel rename"
						onMouseDown={() => setEditing(false)}
					>
						<X size={14} />
					</button>
				</span>
			) : (
				<button
					className="icon-btn ver-edit"
					aria-label={`Rename version ${entry.version}`}
					title="Rename"
					onClick={() => setEditing(true)}
				>
					<Pencil size={13} />
				</button>
			)}
			{isOpen && (
				<div className="ver-detail">
					<div className="ver-detail-label">Saved with</div>
					<p className="ver-detail-message">{entry.message}</p>
				</div>
			)}
		</div>
	)
}

export function VersionsPanel() {
	const { versions, testCase } = useKaneApp()
	const [openVersion, setOpenVersion] = useState<number | null>(null)

	if (versions.length === 0) {
		return (
			<div className="drawer-body">
				<div className="ctx-empty">
					<History size={18} />
					<p>No versions yet. Saving cuts one, with a message describing what changed.</p>
				</div>
			</div>
		)
	}

	return (
		<div className="drawer-body versions-panel">
			<div className="ver-head">
				{versions.length} version{versions.length === 1 ? '' : 's'} of {testCase.id}
			</div>
			<div className="ver-list">
				{versions.map((entry) => (
					<VersionRow
						key={entry.version}
						entry={entry}
						isCurrent={entry.version === testCase.version}
						isOpen={openVersion === entry.version}
						onOpen={() =>
							setOpenVersion((v) => (v === entry.version ? null : entry.version))
						}
					/>
				))}
			</div>
		</div>
	)
}
