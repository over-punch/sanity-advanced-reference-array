/**
 * AdvancedRefArray.tsx - Enhanced Sanity input component for managing arrays of references
 * 
 * This component provides an advanced interface for managing reference arrays in Sanity schemas,
 * combining the best features from multiple implementations with enhanced UX and TypeScript support.
 * 
 * Features:
 * - Advanced search with live GROQ queries
 * - Individual item selection (click-to-add)
 * - Bulk operations with safety controls
 * - Smart filtering of existing items
 * - Dynamic sorting by any document field
 * - Comprehensive error handling
 * - TypeScript support with proper types
 */

import React, { useEffect, useState, useCallback } from 'react'
import { set, unset } from 'sanity'
import { useFormValue } from 'sanity'
import groq from 'groq'

// UI Components
import { Text, TextInput, Stack, Grid, Button, Select, Spinner, Flex } from '@sanity/ui'
import {
	AddIcon,
	DashboardIcon,
	TrashIcon,
	LockIcon,
	UnlockIcon,
	AccessDeniedIcon,
	SortIcon,
	EditIcon,
	UploadIcon
} from '@sanity/icons'

// Custom hooks
import { useSanityClient } from './hooks/useSanityClient'

// Types
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
	
	// Enhanced configuration options
	searchFields?: string[]
	allowIndividualAdd?: boolean
	allowBulkAdd?: boolean
	filterExisting?: boolean
	sortableFields?: string[]
	maxSearchResults?: number
	searchPlaceholder?: string
	showItemCount?: boolean
	enableKeyboardShortcuts?: boolean
}

export const AdvancedRefArray: React.FC<AdvancedRefArrayProps> = (props) => {
	const client = useSanityClient()
	const { 
		onChange, 
		value,
		searchPlaceholder = "Find items to add...",
		allowIndividualAdd = true,
		allowBulkAdd = true,
		filterExisting = true,
		maxSearchResults = 50,
		showItemCount = true,
		enableKeyboardShortcuts = true
	} = props
	const id = useFormValue(['_id'])

	// Component states
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

	// Extract acceptable schema types from props
	const schemaTypes: string[] = []
	props.schemaType.of.forEach((type) => {
		type.to.forEach((toType) => {
			schemaTypes.push(toType.name)
		})
	})

	/**
	 * Searches for items matching the search value within allowed schema types
	 * Enhanced with smart filtering and error handling
	 */
	const searchForItems = useCallback(async (searchValue: string) => {
		if (!searchValue.trim() || !schemaTypes?.length) {
			setFindData([])
			return
		}

		setIsSearching(true)
		setError(null)

		try {
			const items = await client.fetch<SearchResult[]>(
				groq`*[_type in ${JSON.stringify(schemaTypes)} && title match "${searchValue}*"][0...${maxSearchResults}]`
			)

			// Smart filtering: remove items that already exist in the reference array
			const filteredItems = filterExisting && value?.length 
				? items.filter(item => !value.some(ref => ref._ref === item._id))
				: items

			setFindData(filteredItems)
		} catch (err) {
			console.error('Search error:', err)
			setError('Failed to search items. Please try again.')
			setFindData([])
		} finally {
			setIsSearching(false)
		}
	}, [client, schemaTypes, maxSearchResults, filterExisting, value])

	// Debounced search effect
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			searchForItems(findValue)
		}, 300) // 300ms debounce

		return () => clearTimeout(timeoutId)
	}, [findValue, searchForItems])

	/**
	 * Removes all references from the array with confirmation
	 */
	const deleteAllReferences = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		if (window.confirm('Are you sure you want to remove all references? This action cannot be undone.')) {
			onChange(unset())
			setDangerMode(false)
		}
	}, [onChange])

	/**
	 * Adds all search results as references to the array
	 */
	const addAllReferences = useCallback(() => {
		if (!findData?.length) return

		let newValues = value?.length ? [...value] : []
		const newReferences = findData.map((item) => ({
			_type: 'reference' as const,
			_key: Math.random().toString(36).substr(2, 9),
			_ref: item._id,
			_weak: true
		}))

		newValues = [...newValues, ...newReferences]
		
		// Remove duplicates by _ref (safety check)
		newValues = newValues.filter((ref, index, self) =>
			self.findIndex((t) => t._ref === ref._ref) === index
		)

		onChange(set(newValues))
		setFindValue('')
	}, [findData, value, onChange])

	/**
	 * Adds a single item as a reference to the array
	 * Enhanced from TDF version with better UX
	 */
	const addSingleReference = useCallback((item: SearchResult) => {
		if (!item?._id) return

		let newValues = value?.length ? [...value] : []
		
		// Check if this reference already exists
		const exists = newValues.some(val => val._ref === item._id)
		if (exists) return

		const newReference: Reference = {
			_type: 'reference',
			_key: Math.random().toString(36).substr(2, 9),
			_ref: item._id,
			_weak: true
		}

		newValues = [...newValues, newReference]
		onChange(set(newValues))

		// Remove the added item from search results for better UX
		setFindData(prev => prev.filter(searchItem => searchItem._id !== item._id))
	}, [value, onChange])

	// Sort functionality with enhanced error handling
	useEffect(() => {
		if (sortMode) {
			updateDataList()
		}
	}, [sortMode])

	/**
	 * Updates the list of available fields for sorting
	 */
	const updateDataList = async () => {
		if (!sortMode || !value?.length) return

		try {
			const expandedValues = await getSortData()
			if (expandedValues && expandedValues.length > 0) {
				const keys = Object.keys(expandedValues[0])
					.filter(key => !key.startsWith('_')) // Filter out internal fields
					.sort()
				
				if (keys.length > 0) {
					setSortDataType(keys[0])
					setSortDataList(keys)
					await checkAlreadySorted()
				}
			}
		} catch (err) {
			console.error('Error updating sort data:', err)
			setError('Failed to load sorting options.')
		}
	}

	/**
	 * Checks if the current array is already sorted by the selected field
	 * Enhanced with better browser compatibility
	 */
	const checkAlreadySorted = async () => {
		try {
			const expandedRefs = await getSortData()
			if (!expandedRefs || expandedRefs.length === 0) return

			// Use Array.sort() instead of toSorted() for better compatibility
			const sortedRefs = [...expandedRefs].sort((a: any, b: any) => {
				const aValue = a[sortDataType]
				const bValue = b[sortDataType]

				// Handle null/undefined values
				if (aValue == null && bValue == null) return 0
				if (aValue == null) return 1
				if (bValue == null) return -1

				// String comparison
				if (typeof aValue === 'string' && typeof bValue === 'string') {
					return aValue.localeCompare(bValue)
				}

				// Numeric comparison
				if (aValue < bValue) return -1
				if (aValue > bValue) return 1
				return 0
			})

			setAlreadySorted(JSON.stringify(sortedRefs) === JSON.stringify(expandedRefs))
		} catch (err) {
			console.error('Error checking sort status:', err)
		}
	}

	/**
	 * Retrieves expanded data for sorting with enhanced error handling
	 */
	const getSortData = async (): Promise<any[]> => {
		try {
			const query = await client.fetch(groq`*[_id match "${id}*"][0]{"data":${props.id}[]->}`)
			return query?.data || []
		} catch (error) {
			console.error('Error fetching sort data:', error)
			return []
		}
	}

	/**
	 * Sorts all references by the selected field
	 * Enhanced with better error handling and UX feedback
	 */
	const sortAllReferences = async () => {
		if (!value?.length || !sortDataType) return

		setIsSorting(true)
		setError(null)

		try {
			const curRefs = [...value]
			const expandedRefs = await getSortData()

			if (!expandedRefs || expandedRefs.length === 0) {
				setError('No data available for sorting.')
				return
			}

			// Enhanced sorting with proper error handling
			const sortedRefs = [...expandedRefs].sort((a: any, b: any) => {
				const aValue = a[sortDataType]
				const bValue = b[sortDataType]

				// Handle null/undefined values
				if (aValue == null && bValue == null) return 0
				if (aValue == null) return 1
				if (bValue == null) return -1

				// Determine sort direction
				const direction = alreadySorted ? -1 : 1

				// String comparison
				if (typeof aValue === 'string' && typeof bValue === 'string') {
					return direction * aValue.localeCompare(bValue)
				}

				// Numeric comparison
				if (aValue < bValue) return direction * -1
				if (aValue > bValue) return direction * 1
				return 0
			})

			// Create a map for faster lookup
			const refMap = new Map()
			curRefs.forEach(ref => {
				refMap.set(ref._ref, ref)
			})

			// Reorganize references based on sorted order
			const organizedRefs = sortedRefs
				.map(doc => refMap.get(doc._id))
				.filter(Boolean) // Remove any undefined values

			await onChange(set(organizedRefs))

			// Update sort status after a delay
			setTimeout(() => {
				checkAlreadySorted()
			}, 1000)

		} catch (err) {
			console.error('Error sorting references:', err)
			setError('Failed to sort references. Please try again.')
		} finally {
			setIsSorting(false)
		}
	}

	// Keyboard shortcuts
	useEffect(() => {
		if (!enableKeyboardShortcuts) return

		const handleKeyDown = (e: KeyboardEvent) => {
			// Ctrl/Cmd + Enter to add all results
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && findData.length > 0) {
				e.preventDefault()
				addAllReferences()
			}
			// Escape to clear search
			if (e.key === 'Escape' && findValue) {
				e.preventDefault()
				setFindValue('')
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [enableKeyboardShortcuts, findData, findValue, addAllReferences])

	return (
		<Stack style={{ position: 'relative' }}>
			{/* Error display */}
			{error && (
				<div style={{ 
					padding: '8px 12px', 
					backgroundColor: 'rgba(255, 0, 0, 0.1)', 
					border: '1px solid rgba(255, 0, 0, 0.3)',
					borderRadius: '4px',
					marginBottom: '8px',
					color: '#d32f2f'
				}}>
					{error}
				</div>
			)}

			{/* Main control grid */}
			<Grid
				columns={!!(findValue === '' && value?.length) && (!dangerMode && !sortMode) ? 1 : (!findData?.length && !value?.length) || (findValue !== '' && !findData.length) ? 1 : 2}
				style={{ zIndex: 1, position: 'relative' }}
			>
				{sortMode ? (
					<Select
						style={{ borderRadius: '0 3px 0 0' }}
						onChange={(event) => setSortDataType((event.target as HTMLSelectElement).value)}
						value={sortDataType}
						disabled={isSorting}
					>
						{sortDataList.map((item, index) => (
							<option key={`sort-${index}`} value={item}>{item}</option>
						))}
					</Select>
				) : (
					<Flex align="center" style={{ position: 'relative' }}>
						<TextInput
							placeholder={searchPlaceholder}
							value={findValue}
							onChange={(e) => setFindValue((e.target as HTMLInputElement).value)}
							style={{
								maxWidth: !!(findValue === '' && value?.length) && (!dangerMode && !sortMode) ? 'calc(100% - 100px)' : '100%',
							}}
							disabled={isSearching}
						/>
						{isSearching && (
							<div style={{ position: 'absolute', right: '8px' }}>
								<Spinner size={1} />
							</div>
						)}
					</Flex>
				)}

				{/* Add buttons */}
				{!!(findValue !== '' && findData.length) && (
					<Flex gap={1}>
						{allowBulkAdd && (
							<Button 
								text="Add All" 
								tone="positive" 
								onClick={addAllReferences}
								style={{ borderRadius: '0 3px 0 0' }}
								disabled={isSearching}
							/>
						)}
					</Flex>
				)}

				{/* Empty state */}
				{!!(findValue !== '' && !findData.length && !isSearching) && (
					<>
						<div style={{
							maxHeight: '400px',
							minHeight: '40px',
							border: '1px solid rgba(255,255,255,0.1)',
							overflow: 'auto',
							marginTop: '-1px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'rgba(255,255,255,0.5)'
						}}>
							No items found
						</div>
						{showItemCount && (
							<div style={{ pointerEvents: 'none', textAlign: 'right', top: '-30px', paddingRight: '10px', position: 'relative', height: '0px' }}>
								0 items
							</div>
						)}
					</>
				)}

				{/* Action buttons for existing references */}
				{!!(findValue === '' && value?.length) && (
					dangerMode ? (
						<>
							<Button 
								mode="ghost" 
								text="Remove all" 
								tone="critical" 
								onClick={deleteAllReferences} 
								style={{ paddingRight: '50px', borderRadius: '0 3px 0 0' }} 
							/>
							<Button 
								tone="critical" 
								icon={AccessDeniedIcon} 
								onClick={() => { setDangerMode(false); setSortMode(false) }} 
								style={{ position: 'absolute', right: '0', width: '50px', height: '100%', borderRadius: '0 3px 0 0' }}
							/>
						</>
					) : sortMode ? (
						<>
							<Button 
								mode="ghost" 
								text={`Sort (${alreadySorted ? '↓' : '↑'})`} 
								tone="caution" 
								onClick={sortAllReferences}
								disabled={isSorting || !sortDataType}
								style={{ paddingRight: '50px', borderRadius: '0 3px 0 0' }} 
							/>
							<Button 
								tone="caution" 
								icon={AccessDeniedIcon} 
								onClick={() => { setDangerMode(false); setSortMode(false) }} 
								style={{ position: 'absolute', right: '0', width: '50px', height: '100%', borderRadius: '0 3px 0 0' }}
							/>
						</>
					) : (
						<>
							<Button 
								mode="ghost" 
								tone="caution" 
								icon={SortIcon} 
								onClick={() => setSortMode(!sortMode)} 
								style={{ position: 'absolute', right: '49px', width: '50px', height: '100%', borderRadius: '0 0 0 0' }}
							/>
							<Button 
								mode="ghost" 
								tone="critical" 
								icon={LockIcon} 
								onClick={() => setDangerMode(!dangerMode)} 
								style={{ position: 'absolute', right: '0', width: '50px', height: '100%', borderRadius: '0 3px 0 0' }}
							/>
						</>
					)
				)}
			</Grid>

			{/* Search results */}
			<Grid columns={1} style={{ zIndex: 0 }}>
				{!!(findValue !== '' && findData.length) && (
					<>
						<div style={{
							maxHeight: '400px',
							minHeight: '40px',
							border: '1px solid rgba(255,255,255,0.1)',
							overflow: 'auto',
							marginTop: '-1px'
						}}>
							{findData.map((item, index) => (
								<div
									key={`search-result-${index}`}
									className="link"
									onClick={() => allowIndividualAdd && addSingleReference(item)}
									style={{
										cursor: allowIndividualAdd ? 'pointer' : 'default',
										padding: '8px 12px',
										borderBottom: index < findData.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
										transition: 'background-color 0.2s ease',
										...(allowIndividualAdd && {
											':hover': {
												backgroundColor: 'rgba(255,255,255,0.05)'
											}
										})
									}}
									onMouseEnter={(e) => {
										if (allowIndividualAdd) {
											e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
										}
									}}
									onMouseLeave={(e) => {
										if (allowIndividualAdd) {
											e.currentTarget.style.backgroundColor = 'transparent'
										}
									}}
								>
									<Stack>
										<Text size={1} style={{ padding: '0.5em 0' }}>
											{item.title}
											{allowIndividualAdd && (
												<span style={{ 
													opacity: 0.6, 
													fontSize: '0.8em', 
													marginLeft: '8px' 
												}}>
													(click to add)
												</span>
											)}
										</Text>
									</Stack>
								</div>
							))}
						</div>
						{showItemCount && (
							<div style={{ 
								pointerEvents: 'none', 
								textAlign: 'right', 
								top: '-30px', 
								paddingRight: '10px', 
								position: 'relative', 
								height: '0px',
								fontSize: '0.8em',
								opacity: 0.7
							}}>
								{findData.length} item{findData.length !== 1 ? 's' : ''}
								{enableKeyboardShortcuts && allowBulkAdd && findData.length > 1 && (
									<span style={{ marginLeft: '8px' }}>
										(Ctrl+Enter to add all)
									</span>
								)}
							</div>
						)}
					</>
				)}
			</Grid>

			{/* Default Sanity input */}
			<div style={{ marginTop: '-1px' }}>
				{props.renderDefault(props)}
			</div>
		</Stack>
	)
}

export default AdvancedRefArray
