import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitToken, FlitTokenType} from './flit-toker-scanner'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {DomElementEvents} from '../data/dom-element-events'
import {FlitBindingModifiers} from '../data/flit-binding-modifiers'
import {StyleProperties} from '../data/style-properties'
import {TemplateContext} from '../template-decorator'
import {getScriptElementKindFromToken, splitBindingProperty} from './utils'


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
			let info = addSuffixProperty(components, '')

			return this.makeCompletionInfo(info, token)
		}

		// tag
		else if (token.type === FlitTokenType.StartTag) {
			let components = this.analyzer.getComponentsForCompletion(token.attrName)
			let info = addSuffixProperty(components, '')

			return this.makeCompletionInfo(info, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let info = this.getBindingCompletionInfo(token, context)
			return this.makeCompletionInfo(info, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let properties = this.analyzer.getComponentPropertiesForCompletion(token.attrName, token.tagName) || []
			let info = addSuffixProperty(properties, '=')

			return this.makeCompletionInfo(info, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let domEvents = filterForCompletion(DomElementEvents, token.attrName)

			if (token.tagName.includes('-')) {
				let comEvents = this.analyzer.getComponentEventsForCompletion(token.attrName, token.tagName) || []
				let atComEvents = comEvents.map(item => ({name: '@' + item.name, description: item.description}))
				let info = addSuffixProperty([...atComEvents, ...domEvents], '=')

				return this.makeCompletionInfo(info, token)
			}
			else {
				let info = addSuffixProperty(domEvents, '=')
				return this.makeCompletionInfo(info, token)
			}
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let comEvents = this.analyzer.getComponentEventsForCompletion(token.attrName, token.tagName) || []
			let info = addSuffixProperty(comEvents, '=')

			return this.makeCompletionInfo(info, token)
		}

		return null
	}

	private getBindingCompletionInfo(token: FlitToken, context: TemplateContext) {
		let {bindingName, modifiers} = splitBindingProperty(token.attrName)

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

			let items = FlitBindingModifiers.model.filter(item => item.name.startsWith(modifiers[modifiers.length - 1]))
			return addSuffixProperty(items, '')
		}

		// Completion of `:class` will be handled by `CSS Navigation` plugin.

		return []
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
