// Advanced reference array component for Sanity.io that provides search, sort, and bulk management capabilities for reference arrays

// React and Sanity imports
import React, { useEffect, useState, useCallback } from 'react'
import { set, unset } from 'sanity'
import { useFormValue } from 'sanity'
import groq from 'groq'

// UI Components
import { Text, TextInput, Stack, Grid, Button, Select } from '@sanity/ui'
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
interface AdvancedRefArrayProps {
	onChange: (patch: any) => void
	value?: Array<{
		_type: string
		_key: string
		_ref: string
		_weak?: boolean
	}>
	schemaType: {
		of: Array<{
			to: Array<{ name: string }>
		}>
	}
	id: string
	renderDefault: (props: any) => React.ReactNode
}

interface SearchResult {
	_id: string
	title: string
}

export const AdvancedRefArray: React.FC<AdvancedRefArrayProps> = (props) => {
	const client = useSanityClient()
	const { onChange, value } = props
	const id = useFormValue(['_id'])

	// Component states
	const [dangerMode, setDangerMode] = useState(false) // Controls delete mode visibility
	const [findValue, setFindValue] = useState('') // Search input value
	const [findData, setFindData] = useState<SearchResult[]>([]) // Search results
	const [sortMode, setSortMode] = useState(false) // Controls sort mode visibility
	const [sortDataType, setSortDataType] = useState('') // Selected field to sort by
	const [sortDataList, setSortDataList] = useState<string[]>([]) // Available fields for sorting
	const [alreadySorted, setAlreadySorted] = useState(false) // Tracks current sort direction

	// Extract acceptable schema types from props
	const schemaTypes: string[] = []
	props.schemaType.of.forEach((type) => {
		type.to.forEach((toType) => {
			schemaTypes.push(toType.name)
		})
	})

	/**
	 * Searches for items matching the search value within allowed schema types
	 * @param {string} value - Search term
	 */
	async function searchForItems(value: string) {
		const items = findValue !== '' && schemaTypes?.length
			? await client.fetch<SearchResult[]>(groq`*[_type in ${JSON.stringify(schemaTypes)} && title match "${findValue}*"]`)
			: []
		setFindData(items)
	}

	// Update search results when search value changes
	useEffect(() => {
		searchForItems(findValue)
	}, [findValue])

	/**
	 * Removes all references from the array
	 */
	const deleteAllReferences = useCallback((e: React.MouseEvent) => {
		onChange(unset())
	}, [onChange])

	/**
	 * Adds selected references to the array, removing duplicates
	 */
	const addReferences = () => {
		let newValues = value?.length ? value : []
		if (findData?.length) {
			newValues = [
				...newValues,
				...findData.map((item) => ({
					_type: 'reference',
					_key: Math.random().toString(36).substr(2, 9),
					_ref: item._id,
					_weak: true
				}))
			]
		}
		// Remove duplicates by _ref
		newValues = newValues.filter((value, index, self) =>
			self.findIndex((t) => t._ref === value._ref) === index
		)
		onChange(set(newValues))
		setFindValue('')
	}

	// Sort functionality
	useEffect(() => {
		updateDataList()
	}, [sortMode])

	/**
	 * Updates the list of available fields for sorting
	 */
	const updateDataList = async () => {
		if (sortMode) {
			let expandedValues = await getSortData()
			if (expandedValues && expandedValues.length > 0) {
				let keys = Object.keys(expandedValues[0]).sort()
				setSortDataType(keys[0])
				setSortDataList(keys)
				checkAlreadySorted()
			}
		}
	}

	/**
	 * Checks if the current array is already sorted by the selected field
	 */
	const checkAlreadySorted = async () => {
		let expandedRefs = await getSortData()
		if (!expandedRefs || expandedRefs.length === 0) return
		
		let newRefs = expandedRefs.toSorted((a: any, b: any) => {
			if (a[sortDataType] < b[sortDataType]) return -1
			if (a[sortDataType] > b[sortDataType]) return 1
			return 0
		})

		setAlreadySorted(JSON.stringify(newRefs) === JSON.stringify(expandedRefs))
	}

	/**
	 * Retrieves expanded data for sorting
	 * @returns {Promise<Array>} Array of expanded reference data
	 */
	async function getSortData() {
		try {
			let query = await client.fetch(groq`*[_id match "${id}*"][0]{"data":${props.id}[]->}`)
			return query?.data || []
		} catch (error) {
			console.error('Error fetching sort data:', error)
			return []
		}
	}

	/**
	 * Sorts all references by the selected field
	 */
	const sortAllReferences = async () => {
		let curRefs = value?.length ? value : []
		let expandedRefs = await getSortData()
		
		if (!expandedRefs || expandedRefs.length === 0) return

		let newRefs = expandedRefs.toSorted((a: any, b: any) => {
			if (alreadySorted) {
				if (b[sortDataType] < a[sortDataType]) return -1
				if (b[sortDataType] > a[sortDataType]) return 1
			} else {
				if (a[sortDataType] < b[sortDataType]) return -1
				if (a[sortDataType] > b[sortDataType]) return 1
			}
			return 0
		})

		// Organize current refs to match new sort order
		let organizedRefs: any[] = []
		newRefs.forEach((newRef: any) => {
			curRefs.forEach((curRef) => {
				if (newRef._id === curRef._ref) organizedRefs.push(curRef)
			})
		})

		await onChange(set(organizedRefs))
		setTimeout(checkAlreadySorted, 1000)
	}

	return (
		<Stack style={{ position: 'relative' }}>
			<Grid
				columns={!!(findValue == '' && value?.length) && (!dangerMode && !sortMode) ? 1 : (!findData?.length && !value?.length) || (findValue !== '' && !findData.length) ? 1 : 2}
				style={{ zIndex: '1', position: 'relative' }}
			>
				{sortMode ? (
					<Select
						style={{
							borderRadius: '0 3px 0 0',
						}}
						onChange={(event) => { setSortDataType(event.target.value) }}
						value={sortDataType}
					>
						{sortDataList.map((item, index) => (
							<option key={`sort-${index}`} value={item}>{item}</option>
						))}
					</Select>
				) : (
					<TextInput
						placeholder="Find"
						value={findValue}
						onChange={(e) => setFindValue(e.target.value)}
						style={{
							maxWidth: !!(findValue == '' && value?.length) && (!dangerMode && !sortMode) ? 'calc(100% - 100px)' : '100%',
						}}
					/>
				)}
				{!!(findValue !== '' && findData.length) && (
					<Button text="Add" tone='positive' onClick={() => addReferences()} style={{ borderRadius: '0 3px 0 0' }} />
				)}
				{!!(findValue !== '' && !findData.length) && (
					<>
						<div
							style={{
								maxHeight: '400px',
								minHeight: '40px',
								border: '1px solid rgba(255,255,255,0.1)',
								overflow: 'auto',
								marginTop: '-1px'
							}}
						/>
						<div style={{ pointerEvents: 'none', textAlign: 'right', top: '-30px', paddingRight: '10px', position: 'relative', height: '0px' }}>0 items</div>
					</>
				)}
				{!!(findValue == '' && value?.length) && (
					dangerMode ? (
						<>
							<Button mode="ghost" text="Remove all" tone='critical' onClick={() => deleteAllReferences} style={{ paddingRight: '50px', borderRadius: '0 3px 0 0' }} />
							<Button mode="" tone="critical" icon={AccessDeniedIcon} onClick={() => { setDangerMode(false), setSortMode(false) }} style={{ position: 'absolute', right: '0', width: '50px', height: '100%', borderRadius: '0 3px 0 0' }} />
						</>
					) : sortMode ? (
						<>
							<Button mode="ghost" text={`Sort (${alreadySorted ? '↓' : '↑'})`} tone='caution' onClick={() => sortAllReferences()} style={{ paddingRight: '50px', borderRadius: '0 3px 0 0' }} />
							<Button mode="" tone="caution" icon={AccessDeniedIcon} onClick={() => { setDangerMode(false), setSortMode(false) }} style={{ position: 'absolute', right: '0', width: '50px', height: '100%', borderRadius: '0 3px 0 0' }} />
						</>
					) : (
						<>
							<Button mode="ghost" tone="caution" icon={SortIcon} onClick={() => { setSortMode(!sortMode) }} style={{ position: 'absolute', right: '49px', width: '50px', height: '100%', borderRadius: '0 0 0 0' }} />
							<Button mode="ghost" tone="critical" icon={LockIcon} onClick={() => { setDangerMode(!dangerMode) }} style={{ position: 'absolute', right: '0', width: '50px', height: '100%', borderRadius: '0 3px 0 0' }} />
						</>
					)
				)}
			</Grid>

			<Grid columns={1} style={{ zIndex: '0' }}>
				{!!(findValue !== '' && findData.length) && (
					<>
						<div
							style={{
								maxHeight: '400px',
								minHeight: '40px',
								border: '1px solid rgba(255,255,255,0.1)',
								overflow: 'auto',
								marginTop: '-1px'
							}}
						>
							{findData.map((item, index) => (
								<a target="_blank" key={`collection-${index}`} className="link" href={`${window.location.origin}/desk/collection;${item._id}`}>
									<Stack>
										<Text size={1} style={{ padding: '1em 1em .5em' }}>{item.title}</Text>
									</Stack>
								</a>
							))}
						</div>
						<div style={{ pointerEvents: 'none', textAlign: 'right', top: '-30px', paddingRight: '10px', position: 'relative', height: '0px' }}>{findData.length} items</div>
					</>
				)}
			</Grid>

			<div style={{ marginTop: '-1px' }}>
				{props.renderDefault(props)}
			</div>
		</Stack>
	)
}

export default AdvancedRefArray