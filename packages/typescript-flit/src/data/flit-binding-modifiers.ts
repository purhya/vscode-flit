export const FlitBindingModifiers: Record<'style' | 'model', DataItem[]> = {
	style: [
		{name: 'px', description: 'Add `px` unit for computed value.'},
		{name: 'percent', description: 'Add `%` in the end of computed value.'},
		{name: 'url', description: 'Wrap computed value with `url()`.'},
	],
	model: [
		{name: 'lazy', description: 'Modify value after `change` event if specified, otherwise modify after `input` event.'},
		{name: 'number', description: 'Converte string as number.'},
	]
}