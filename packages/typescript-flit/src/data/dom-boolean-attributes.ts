export const DomBooleanAttributes: BooleanAttribute[] = [
	{
		name: 'allowfullscreen',
		description: 'Allows iframe content to get fullscreen.',
		forElements: ['iframe'],
	},
	{
		name: 'autofocus',
		description: 'Associated element will get focus when the page loads.',
		forElements: ['input', 'select', 'keygon', 'textarea'],
	},
	{
		name: 'autoplay',
		description: 'Playback should automatically begin as soon as enough media is available to do so.',
		forElements: ['audio', 'video'],
	},
	{
		name: 'controls',
		description: 'Controls whether user interface controls for playing the media item will be displayed.',
	},
	{
		name: 'disabled',
		description: 'The control is disabled, element is unusable and un-clickable.',
	},
	{
		name: 'formnovalidate',
		description: 'Indicates that the form is not to be validated when clicking this element to submit.',
		forElements: ['button', 'input'],
	},
	{
		name: 'hidden',
		description: 'Makes the element hidden.',
	},
	{
		name: 'ismap',
		description: 'Indicates the image is to be used by a server-side image map.',
		forElements: ['image'],
	},
	{
		name: 'itemscope',
		description: 'Defines the scope of associated metadata.',
	},
	{
		name: 'loop',
		description: 'The media element should start over when it reaches the end.',
	},
	{
		name: 'multiple',
		description: 'The input or select element can have more than one value.',
		forElements: ['input', 'select'],
	},
	{
		name: 'muted',
		description: 'The media element was muted.',
		forElements: ['audio', 'video'],
	},
	{
		name: 'novalidate',
		description: 'The form element shouldn\'t be validated when submitted.',
		forElements: ['form'],
	},
	{
		name: 'playsinline',
		description: 'The video is to be played "inline", that is within the element\'s playback area.',
		forElements: ['video'],
	},
	{
		name: 'readonly',
		description: 'Makes the element not mutable, meaning the user can not edit the control.',
		forElements: ['input', 'textarea', 'select'],
	},
	{
		name: 'required',
		description: 'User must specify a value for the input before the owning form can be submitted.',
		forElements: ['input', 'textarea', 'select'],
	},
	{
		name: 'reversed',
		description: 'The list\'s items are in reverse order. Items will be numbered from high to low.',
		forElements: ['ol'],
	},
	{
		name: 'selected',
		description: 'Indicates that the option is initially selected.',
		forElements: ['option'],
	},
]