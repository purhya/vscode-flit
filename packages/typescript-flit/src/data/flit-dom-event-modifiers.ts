type EventCategory = 'global' | 'key' | 'mouse' | 'change' | 'wheel'


export const FlitDomEventModifiers: Record<EventCategory, DataItem[]> = {
	global: [
		{name: 'capture', description: 'Trigger event only in capture phases, not bubble phases.'},
		{name: 'self', description: 'Trigger event only when event target is current element and not child element.'},
		{name: 'once', description: 'Trigger event for only once.'},
		{name: 'prevent', description: 'Prevents default action for event, e.g., prevent a contextmenu event will cause no browser menu popup.'},
		{name: 'stop', description: 'Stops event propagation and event will not broadcast to parents or children.'},
		{name: 'passive', description: 'Browser will not wait listener to execute completed before painting. so, e.g., you will get better performance when scrolling.'},
	],
	key: [
		{name: 'ctrl', description: 'Trigger key event only when ctrl key pressed.'},
		{name: 'shift', description: 'Trigger key event only when shift key pressed.'},
		{name: 'alt', description: 'Trigger key event only when alt key pressed.'},
	],
	mouse: [
		{name: 'left', description: 'Trigger mouse event only when interact with left button.'},
		{name: 'middle', description: 'Trigger mouse event only when interact with middle button.'},
		{name: 'right', description: 'Trigger mouse event only when interact with right button.'},
		{name: 'main', description: 'Trigger mouse event only when interact with main button.'},
		{name: 'auxiliary', description: 'Trigger mouse event only when interact with auxiliary button.'},
		{name: 'secondary', description: 'Trigger mouse event only when interact with secondary button.'},
	],
	change: [
		{name: 'check', description: 'Trigger change event only when input becomes checked.'},
		{name: 'uncheck', description: 'Trigger change event only when input becomes unchecked.'},
	],
	wheel: [
		{name: 'up', description: 'Trigger wheel event only when wheel up.'},
		{name: 'down', description: 'Trigger wheel event only when wheel down.'},
	],
}


export const FlitEventCategories: Record<string, EventCategory> = {
	keydown: 'key',
	keyup: 'key',
	keypress: 'key',
	mousedown: 'mouse',
	mousemove: 'mouse',
	mouseup: 'mouse',
	click: 'mouse',
	dblclick: 'mouse',
	change: 'change',
	wheel: 'wheel',
}
