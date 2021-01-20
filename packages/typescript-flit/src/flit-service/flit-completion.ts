import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitToken, FlitTokenType} from './flit-toker-scanner'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {DomElementEvents} from '../data/dom-element-events'
import {FlitBindingModifiers} from '../data/flit-binding-modifiers'
import {StyleProperties} from '../data/style-properties'
import {TemplateContext} from '../template-decorator'
import {getScriptElementKindFromToken, splitPropertyAndModifiers} from './utils'
import {FlitDomEventModifiers, FlitEventCategories} from '../data/flit-dom-event-modifiers'


/** Provide flit completion service. */
export class FlitCompletion {

	constructor(
		private readonly analyzer: FlitAnalyzer,
		private readonly typescript: typeof ts
	) {}
	
	getCompletions(token: FlitToken, context: TemplateContext): ts.CompletionInfo | null {
		// <
		if (token.type === FlitTokenType.StartTagOpen) {
			let components = this.analyzer.getComponentsForCompletion('')
			let items = addSuffixProperty(components, '')

			return this.makeCompletionInfo(items, token)
		}

		// tag
		else if (token.type === FlitTokenType.StartTag) {
			let components = this.analyzer.getComponentsForCompletion(token.attrName)
			let items = addSuffixProperty(components, '')

			return this.makeCompletionInfo(items, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let items = this.getBindingCompletionItems(token, context)
			return this.makeCompletionInfo(items, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let properties = this.analyzer.getComponentPropertiesForCompletion(token.attrName, token.tagName) || []
			let items = addSuffixProperty(properties, '=')

			return this.makeCompletionInfo(items, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let items = this.getEventCompletionItems(token)

			if (token.tagName.includes('-') && !token.attrName.includes('.')) {
				let comEvents = this.analyzer.getComponentEventsForCompletion(token.attrName, token.tagName) || []
				let atComEvents = comEvents.map(item => ({name: '@' + item.name, description: item.description}))

				items.unshift(
					...addSuffixProperty(atComEvents, '=')
				)
			}

			return this.makeCompletionInfo(items, token)
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let comEvents = this.analyzer.getComponentEventsForCompletion(token.attrName, token.tagName) || []
			let info = addSuffixProperty(comEvents, '=')

			return this.makeCompletionInfo(info, token)
		}

		return null
	}

	private getBindingCompletionItems(token: FlitToken, context: TemplateContext) {
		let [bindingName, modifiers] = splitPropertyAndModifiers(token.attrName)

		// If `:ref="|"`.
		if (token.attrValue !== null && ['ref', 'slot'].includes(token.attrName)) {
			let attrValue = token.attrValue.replace(/^['"](.*?)['"]$/, '$1')
			let componentPropertyName = token.attrName + 's' as 'refs' | 'slots'

			// Moves token range to `"|???|"`.
			token.attrPrefix = ''
			token.start += 1
			token.end -= 1

			let items = this.analyzer.getSubPropertiesForCompletion(context.node, componentPropertyName, attrValue)
			if (items) {
				return addSuffixProperty(items, '')
			}
		}
		
		// `:show`, without modifiers.
		if (modifiers.length === 0) {
			let bindings = this.analyzer.getBindingsForCompletion(token.attrName)
			let items = addSuffixProperty(bindings, '=')

			// `:class` or `:style`, `:model` may have `.` followed.
			items.forEach(item => {
				if (item.name === 'class' || FlitBindingModifiers.hasOwnProperty(item.name)) {
					item.suffix = ''
				}
			})

			return items
		}

		if (bindingName === 'style') {
			// Complete modifiers.
			if (modifiers.length === 1) {

				// Move cursor to `:style|.`
				token.start += 1 + bindingName.length
				token.attrPrefix = '.'

				let items = filterForCompletion(StyleProperties, modifiers[0])
				return addSuffixProperty(items, '')
			}

			// Complete style property.
			else {

				// Move cursor to `:style.font-size|.`
				token.start += 1 + bindingName.length + 1 + modifiers[0].length
				token.attrPrefix = '.'

				let items = filterForCompletion(FlitBindingModifiers.style, modifiers[modifiers.length - 1])
				return addSuffixProperty(items, '=')
			}
		}
		else if (bindingName === 'model') {

			// Move cursor to `:model???|.`
			token.start = token.end - (1 + modifiers[modifiers.length - 1].length)
			token.attrPrefix = '.'

			let items = filterForCompletion(FlitBindingModifiers.model, modifiers[modifiers.length - 1])
			return addSuffixProperty(items, '')
		}

		// Completion of `:class` will be handled by `CSS Navigation` plugin.

		return []
	}
	
	private getEventCompletionItems(token: FlitToken) {
		let [eventName, modifiers] = splitPropertyAndModifiers(token.attrName)

		// `@click`, without modifiers.
		if (modifiers.length === 0) {
			let items = filterForCompletion(DomElementEvents, token.attrName)

			return addSuffixProperty(items, '')
		}

		// `@click.l`, with modifiers.
		else {

			// Move cursor to `@click???|.l`
			token.start = token.end - (1 + modifiers[modifiers.length - 1].length)
			token.attrPrefix = '.'

			// .passive, .stop, ...
			let items = filterForCompletion(FlitDomEventModifiers.global, modifiers[modifiers.length - 1])

			// .left, .right.
			if (FlitEventCategories[eventName]) {
				let category = FlitEventCategories[eventName]
				items.push(...filterForCompletion(FlitDomEventModifiers[category], modifiers[modifiers.length - 1]))
			}

			return addSuffixProperty(items, '')
		}
	}

	private makeCompletionInfo(
		items: {name: string, description: string | null, suffix: string}[],
		token: FlitToken,
	): ts.CompletionInfo {
		let entries: ts.CompletionEntry[] = items.map(item => {
			let name = token.attrPrefix + item.name
			let kind = getScriptElementKindFromToken(token, this.typescript)

			let replacementSpan: ts.TextSpan = {
				start: token.start,
				length: token.end - token.start,
			}

			return {
				name,
				kind,
				sortText: item.name,
				insertText: name + item.suffix,
				replacementSpan,
			}
		})

		return {
			isGlobalCompletion: false,
			isMemberCompletion: false,
			isNewIdentifierLocation: false,
			entries: entries,
		}
	}
}


function filterForCompletion<T extends {name: string}>(items: T[], label: string): T[] {
	return items.filter(item => item.name.startsWith(label))
}

function addSuffixProperty(items: {name: string, description: string | null}[], suffix: string) {
	return items.map(item => ({
		name: item.name,
		description: item.description,
		suffix,
	}))
}
