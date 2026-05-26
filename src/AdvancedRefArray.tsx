/**
 * AdvancedRefArray.tsx - Enhanced Sanity input component for managing arrays of references
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { set, unset } from 'sanity'
import { Text, TextInput, Stack, Button, Select, Spinner } from '@sanity/ui'
import { AccessDeniedIcon, SortIcon, LockIcon } from '@sanity/icons'
import { useSanityClient } from './hooks/useSanityClient'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reference {
	_type: string
	_key: string
	_ref: string
	_weak?: boolean
}

interface SearchResult {
	_id: string
	title: string
	[key: string]: any
}

interface SchemaType {
	of: Array<{
		to: Array<{ name: string }>
	}>
}

interface AdvancedRefArrayProps {
	onChange: (patch: any) => void
	value?: Reference[]
	schemaType: SchemaType
	id: string
	renderDefault: (props: any) => React.ReactNode
	allowIndividualAdd?: boolean
	allowBulkAdd?: boolean
	filterExisting?: boolean
	maxSearchResults?: number
	searchPlaceholder?: string
	showItemCount?: boolean
	enableKeyboardShortcuts?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AdvancedRefArray: React.FC<AdvancedRefArrayProps> = (props) => {
	const client = useSanityClient()
	const {
		onChange,
		value,
		searchPlaceholder = 'Find items to add...',
		allowIndividualAdd = true,
		allowBulkAdd = true,
		filterExisting = true,
		maxSearchResults = 50,
		showItemCount = true,
		enableKeyboardShortcuts = true,
	} = props

	const [dangerMode, setDangerMode] = useState(false)
	const [findValue, setFindValue] = useState('')
	const [findData, setFindData] = useState<SearchResult[]>([])
	const [isSearching, setIsSearching] = useState(false)
	const [sortMode, setSortMode] = useState(false)
	const [sortDataType, setSortDataType] = useState('')
	const [sortDataList, setSortDataList] = useState<string[]>([])
	const [alreadySorted, setAlreadySorted] = useState(false)
	const [isSorting, setIsSorting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isInputFocused, setIsInputFocused] = useState(false)

	// Refs that always hold the latest values — used inside the debounced search
	// so the effect never needs to re-run due to prop/state changes other than findValue
	const latestRef = useRef({ client, value, filterExisting, maxSearchResults, schemaType: props.schemaType })
	useEffect(() => {
		latestRef.current = { client, value, filterExisting, maxSearchResults, schemaType: props.schemaType }
	})

	// ─── Search — only re-fires when the query text changes ──────────────────

	useEffect(() => {
		if (!findValue.trim()) {
			setFindData([])
			setIsSearching(false)
			return
		}

		let cancelled = false
		setError(null)

		const timeoutId = setTimeout(async () => {
			if (cancelled) return
			setIsSearching(true)

			const { client, value, filterExisting, maxSearchResults, schemaType } = latestRef.current

			const schemaTypes: string[] = []
			schemaType.of.forEach((type) => type.to.forEach((t) => schemaTypes.push(t.name)))

			if (!schemaTypes.length) {
				setIsSearching(false)
				return
			}

			try {
				// Note: GROQ slice bounds must be literal integers — parameters like
				// `[0...$limit]` fail validation, which silently broke search in v1.0.x.
				// `maxSearchResults` is a typed number prop (default 50) so inlining is safe.
				const items = await client.fetch<SearchResult[]>(
					`*[_type in $types && title match $search][0...${maxSearchResults}]`,
					{ types: schemaTypes, search: `${findValue}*` }
				)
				if (cancelled) return

				const filtered = filterExisting && value?.length
					? items.filter(item => !value.some(ref => ref._ref === item._id))
					: items
				setFindData(filtered)
			} catch (err) {
				if (cancelled) return
				console.error('Search error:', err)
				setError('Failed to search items. Please try again.')
				setFindData([])
			} finally {
				if (!cancelled) setIsSearching(false)
			}
		}, 300)

		return () => {
			cancelled = true
			clearTimeout(timeoutId)
		}
	}, [findValue])

	// ─── Reference mutations ──────────────────────────────────────────────────

	/** Removes all references after confirmation */
	const deleteAllReferences = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		if (window.confirm('Are you sure you want to remove all references? This action cannot be undone.')) {
			onChange(unset())
			setDangerMode(false)
		}
	}, [onChange])

	/** Adds all current search results as references */
	const addAllReferences = useCallback(() => {
		if (!findData?.length) return
		let newValues = value?.length ? [...value] : []
		const newRefs = findData.map((item) => ({
			_type: 'reference' as const,
			_key: Math.random().toString(36).substr(2, 9),
			_ref: item._id,
			_weak: true,
		}))
		newValues = [...newValues, ...newRefs].filter(
			(ref, i, self) => self.findIndex(t => t._ref === ref._ref) === i
		)
		onChange(set(newValues))
		setFindValue('')
	}, [findData, value, onChange])

	/** Adds a single item as a reference */
	const addSingleReference = useCallback((item: SearchResult) => {
		if (!item?._id) return
		const newValues = value?.length ? [...value] : []
		if (newValues.some(val => val._ref === item._id)) return
		newValues.push({ _type: 'reference', _key: Math.random().toString(36).substr(2, 9), _ref: item._id, _weak: true })
		onChange(set(newValues))
		setFindData(prev => prev.filter(r => r._id !== item._id))
	}, [value, onChange])

	// ─── Sort ─────────────────────────────────────────────────────────────────

	const getSortData = useCallback(async (): Promise<any[]> => {
		if (!value?.length) return []
		try {
			const ids = value.map(ref => ref._ref).filter(Boolean)
			const docs = await client.fetch(`*[_id in $ids]`, { ids })
			return value.map(ref => docs.find((d: any) => d._id === ref._ref)).filter(Boolean)
		} catch (err) {
			console.error('Error fetching sort data:', err)
			return []
		}
	}, [client, value])

	const checkAlreadySorted = useCallback(async (field: string) => {
		const refs = await getSortData()
		if (!refs.length) return
		const sorted = [...refs].sort((a, b) => {
			const av = a[field]; const bv = b[field]
			if (av == null && bv == null) return 0
			if (av == null) return 1
			if (bv == null) return -1
			return typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : av < bv ? -1 : av > bv ? 1 : 0
		})
		setAlreadySorted(JSON.stringify(sorted) === JSON.stringify(refs))
	}, [getSortData])

	useEffect(() => {
		if (!sortMode || !value?.length) return
		getSortData().then(expanded => {
			if (!expanded.length) return
			const keys = Object.keys(expanded[0]).filter(k => !k.startsWith('_')).sort()
			if (keys.length) {
				setSortDataType(keys[0])
				setSortDataList(keys)
				checkAlreadySorted(keys[0])
			}
		}).catch(err => {
			console.error('Error updating sort data:', err)
			setError('Failed to load sorting options.')
		})
	}, [sortMode])

	const sortAllReferences = useCallback(async () => {
		if (!value?.length || !sortDataType) return
		setIsSorting(true)
		setError(null)
		try {
			const refs = await getSortData()
			if (!refs.length) { setError('No data available for sorting.'); return }
			const dir = alreadySorted ? -1 : 1
			const sorted = [...refs].sort((a, b) => {
				const av = a[sortDataType]; const bv = b[sortDataType]
				if (av == null && bv == null) return 0
				if (av == null) return dir
				if (bv == null) return -dir
				return typeof av === 'string' && typeof bv === 'string'
					? dir * av.localeCompare(bv)
					: av < bv ? -dir : av > bv ? dir : 0
			})
			const refMap = new Map(value.map(ref => [ref._ref, ref]))
			onChange(set(sorted.map(doc => refMap.get(doc._id)).filter(Boolean)))
			setTimeout(() => checkAlreadySorted(sortDataType), 1000)
		} catch (err) {
			console.error('Error sorting:', err)
			setError('Failed to sort references. Please try again.')
		} finally {
			setIsSorting(false)
		}
	}, [value, sortDataType, alreadySorted, getSortData, onChange, checkAlreadySorted])

	// ─── Keyboard shortcuts ───────────────────────────────────────────────────

	useEffect(() => {
		if (!enableKeyboardShortcuts) return
		const handler = (e: KeyboardEvent) => {
			if (!isInputFocused) return
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && findData.length > 0) {
				e.preventDefault()
				addAllReferences()
			}
			if (e.key === 'Escape' && findValue) {
				e.preventDefault()
				setFindValue('')
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [enableKeyboardShortcuts, findData, findValue, addAllReferences, isInputFocused])

	// ─── Derived state ────────────────────────────────────────────────────────

	const hasItems = !!(value?.length)
	const hasSearch = findValue !== ''
	const hasResults = findData.length > 0
	// Show sort+lock buttons: idle state with existing refs and no active search
	const showIdleButtons = hasItems && !hasSearch && !dangerMode && !sortMode

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<Stack style={{ position: 'relative' }}>
			{error && (
				<div style={{ padding: '8px 12px', backgroundColor: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: 4, marginBottom: 8, color: '#d32f2f' }}>
					{error}
				</div>
			)}

			{/* Control row — plain div so width is always 100% of parent */}
			<div style={{ position: 'relative', display: 'flex', zIndex: 1 }}>
				{sortMode ? (
					<Select
						style={{ flex: 1, borderRadius: '3px 3px 0 0' }}
						onChange={(e) => { setSortDataType((e.target as HTMLSelectElement).value); checkAlreadySorted((e.target as HTMLSelectElement).value) }}
						value={sortDataType}
						disabled={isSorting}
					>
						{sortDataList.map((item, i) => <option key={i} value={item}>{item}</option>)}
					</Select>
				) : (
					// When idle buttons (sort + lock) are visible, physically shrink the input wrapper
					// by 100px (50px per button) so the absolutely-positioned buttons sit in their own
					// space. Padding-only spacing left the <input> element overlapping the buttons,
					// which captured the click events and made sort/delete unclickable.
					<div style={{ position: 'relative', flex: 1, marginRight: showIdleButtons ? 100 : 0 }}>
						<TextInput
							placeholder={searchPlaceholder}
							value={findValue}
							onChange={(e) => setFindValue((e.target as HTMLInputElement).value)}
							onFocus={() => setIsInputFocused(true)}
							onBlur={() => setIsInputFocused(false)}
							style={{ width: '100%', paddingRight: isSearching ? 32 : undefined }}
						/>
						{isSearching && (
							<div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
								<Spinner size={1} />
							</div>
						)}
					</div>
				)}

				{/* Add All button — appears beside input when there are results */}
				{hasSearch && hasResults && allowBulkAdd && (
					<Button text="Add All" tone="positive" onClick={addAllReferences} disabled={isSearching} style={{ borderRadius: '0 3px 3px 0', flexShrink: 0 }} />
				)}

				{/* Idle buttons — sort + lock, absolutely positioned over the right edge of input */}
				{showIdleButtons && (
					<>
						<Button
							mode="ghost"
							tone="caution"
							icon={SortIcon}
							onClick={() => setSortMode(true)}
							style={{ position: 'absolute', right: 50, top: 0, bottom: 0, width: 50, borderRadius: 0 }}
						/>
						<Button
							mode="ghost"
							tone="critical"
							icon={LockIcon}
							onClick={() => setDangerMode(true)}
							style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 50, borderRadius: '0 3px 3px 0' }}
						/>
					</>
				)}

				{/* Danger mode */}
				{dangerMode && !sortMode && (
					<>
						<Button mode="ghost" text="Remove all" tone="critical" onClick={deleteAllReferences} style={{ flex: 1, paddingRight: 50 }} />
						<Button tone="critical" icon={AccessDeniedIcon} onClick={() => setDangerMode(false)} style={{ flexShrink: 0, width: 50 }} />
					</>
				)}

				{/* Sort mode action */}
				{sortMode && (
					<>
						<Button
							mode="ghost"
							text={`Sort (${alreadySorted ? '↓' : '↑'})`}
							tone="caution"
							onClick={sortAllReferences}
							disabled={isSorting || !sortDataType}
							style={{ flexShrink: 0 }}
						/>
						<Button
							tone="caution"
							icon={AccessDeniedIcon}
							onClick={() => { setSortMode(false); setDangerMode(false) }}
							style={{ flexShrink: 0, width: 50 }}
						/>
					</>
				)}
			</div>

			{/* Search results */}
			{hasSearch && (
				<div style={{ border: '1px solid rgba(255,255,255,0.1)', borderTop: 'none', borderRadius: '0 0 3px 3px', overflow: 'auto', maxHeight: 400 }}>
					{isSearching && !hasResults ? (
						<div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Searching…</div>
					) : !hasResults ? (
						<div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No items found</div>
					) : (
						<>
							{findData.map((item, i) => (
								<div
									key={`result-${i}`}
									onClick={() => allowIndividualAdd && addSingleReference(item)}
									onMouseEnter={(e) => { if (allowIndividualAdd) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)' }}
									onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
									style={{ padding: '8px 12px', cursor: allowIndividualAdd ? 'pointer' : 'default', borderBottom: i < findData.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
								>
									<Text size={1}>
										{item.title}
										{allowIndividualAdd && <span style={{ opacity: 0.5, fontSize: '0.8em', marginLeft: 8 }}>(click to add)</span>}
									</Text>
								</div>
							))}
							{showItemCount && (
								<div style={{ padding: '4px 12px', fontSize: '0.8em', opacity: 0.5, textAlign: 'right' }}>
									{findData.length} item{findData.length !== 1 ? 's' : ''}
									{enableKeyboardShortcuts && allowBulkAdd && findData.length > 1 && <span style={{ marginLeft: 8 }}>(⌘↩ to add all)</span>}
								</div>
							)}
						</>
					)}
				</div>
			)}

			{/* Default Sanity array input */}
			<div style={{ marginTop: -1 }}>
				{props.renderDefault(props)}
			</div>
		</Stack>
	)
}

export default AdvancedRefArray
