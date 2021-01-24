type DataItem = {
	readonly name: string
	readonly description: string
}

interface BooleanAttribute extends DataItem {
	forElements?: string[]
}