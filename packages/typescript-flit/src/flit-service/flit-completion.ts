import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitToken, FlitTokenType} from './flit-toker-scanner'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {DomElementEvents} from '../data/dom-element-events'
import {FlitBindingModifiers} from '../data/flit-binding-modifiers'
import {StyleProperties} from '../data/style-properties'
import {getScriptElementKindFromToken, splitPropertyAndModifiers} from './utils'
import {FlitDomEventModifiers, FlitEventCategories} from '../data/flit-dom-event-modifiers'
import {DomBooleanAttributes} from '../data/dom-boolean-attributes'
import {findNodeAscent} from '../ts-utils/ast-utils'
import {getSimulateTokenFromNonTemplate} from './non-template'


/** Provide flit completion service. */
export class FlitCompletion {

	constructor(
		private readonly analyzer: FlitAnalyzer,
		private readonly typescript: typeof ts
	) {}
	
	getCompletions(token: FlitToken, contextNode: ts.Node): ts.CompletionInfo | null {
		// <
		if (token.type === FlitTokenType.StartTagOpen) {
			let components = this.analyzer.getComponentsForCompletion('')
			return this.makeCompletionInfo(components, token)
		}

		// tag
		else if (token.type === FlitTokenType.StartTag) {
			let components = this.analyzer.getComponentsForCompletion(token.attrName)
			return this.makeCompletionInfo(components, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let items = this.getBindingCompletionItems(token, contextNode)
			return this.makeCompletionInfo(items, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let items = this.getPropertyCompletionInfo(token)
			return this.makeCompletionInfo(items, token)
		}

		// xxx="|"
		else if (token.attrValue !== null) {
			return null
		}

		// ?xxx
		else if (token.type === FlitTokenType.BooleanAttribute) {
			let properties = filterBooleanAttributeForCompletion(token.attrName, token.tagName)
			let items = addSuffixProperty(properties, '=', token)

			return this.makeCompletionInfo(items, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let items = this.getEventCompletionItems(token) as {name: string, description: string | null}[]

			if (token.tagName.includes('-') && !token.attrName.includes('.')) {
				let comEvents = this.analyzer.getComponentEventsForCompletion(token.attrName, token.tagName) || []
				let atComEvents = comEvents.map(item => ({name: '@' + item.name, description: item.description}))

				items.unshift(
					...addSuffixProperty(atComEvents, '=', token)
				)
			}

			return this.makeCompletionInfo(items, token)
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let comEvents = this.analyzer.getComponentEventsForCompletion(token.attrName, token.tagName) || []
			let info = addSuffixProperty(comEvents, '=', token)

			return this.makeCompletionInfo(info, token)
		}

		return null
	}

	private getBindingCompletionItems(token: FlitToken, contextNode: ts.Node) {
		let [bindingName, modifiers] = splitPropertyAndModifiers(token.attrName)

		// `:ref="|"`.
		if (token.attrValue !== null) {
			let attrValue = token.attrValue.replace(/^['"](.*?)['"]$/, '$1')

			// Moves token range to `"|???|"`.
			token.attrPrefix = ''
			token.start += 1
			token.end -= 1

			if (['ref', 'slot'].includes(token.attrName)) {
				let customTagName: string | null = null
				let componentPropertyName = token.attrName + 's' as 'refs' | 'slots'

				// Get ancestor class declaration.
				if (token.attrName === 'ref') {
					let declaration = findNodeAscent(contextNode, child => this.typescript.isClassLike(child)) as ts.ClassLikeDeclaration
					if (!declaration) {
						return null
					}

					customTagName = this.analyzer.getComponentByDeclaration(declaration)?.name || null
				}
				// Get closest component tag.
				else {
					customTagName = token.closestCustomTagName
				}

				if (!customTagName) {
					return null
				}

				let items = this.analyzer.getSubPropertiesForCompletion(componentPropertyName, attrValue, customTagName)
				return items
			}

			// `:model="|"`.
			else if (['model', 'refComponent'].includes(token.attrName)) {
				let declaration = findNodeAscent(contextNode, child => this.typescript.isClassLike(child)) as ts.ClassLikeDeclaration
				if (!declaration) {
					return null
				}

				let customTagName = this.analyzer.getComponentByDeclaration(declaration)?.name || null
				if (!customTagName) {
					return null
				}

				let items = this.analyzer.getComponentPropertiesForCompletion(attrValue, customTagName, false)
				return items
			}
		}
		
		// `:show`, without modifiers.
		if (modifiers.length === 0) {
			let bindings = this.analyzer.getBindingsForCompletion(token.attrName)
			let items = addSuffixProperty(bindings, '=', token)

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
				return items
			}

			// Complete style property.
			else {

				// Move cursor to `:style.font-size|.`
				token.start += 1 + bindingName.length + 1 + modifiers[0].length
				token.attrPrefix = '.'

				let items = filterForCompletion(FlitBindingModifiers.style, modifiers[modifiers.length - 1])
				return addSuffixProperty(items, '=', token)
			}
		}
		else if (bindingName === 'model') {

			// Move cursor to `:model???|.`
			token.start = token.end - (1 + modifiers[modifiers.length - 1].length)
			token.attrPrefix = '.'

			let items = filterForCompletion(FlitBindingModifiers.model, modifiers[modifiers.length - 1])
			return items
		}

		// Completion of `:class` will be handled by `CSS Navigation` plugin.

		return null
	}

	private getPropertyCompletionInfo(token: FlitToken) {
		// If `.property="|"`.
		if (token.attrValue !== null) {
			let attrValue = token.attrValue.replace(/^['"](.*?)['"]$/, '$1')

			// Moves token range to `"|???|"`.
			token.attrPrefix = ''
			token.start += 1
			token.end -= 1

			// For `<f-icon .type="|">`
			if (token.tagName.includes('icon') && token.attrName === 'type') {
				let icons = this.analyzer.getIconsForCompletion(attrValue)
				return icons
			}

			// For `type="a" | "b" | "c"`
			else {
				let property = this.analyzer.getComponentProperty(token.attrName, token.tagName)
				if (!property) {
					return null
				}

				let typeStringList = this.analyzer.getTypeUnionStringList(property.type)

				return typeStringList.map(name => {
					return {
						name,
						description: null,
					}
				})
			}
		}

		// .property|
		else {
			let properties = this.analyzer.getComponentPropertiesForCompletion(token.attrName, token.tagName) || []
			return properties
		}
	}
	
	private getEventCompletionItems(token: FlitToken) {
		let [eventName, modifiers] = splitPropertyAndModifiers(token.attrName)

		// `@click`, without modifiers.
		if (modifiers.length === 0) {
			let items = filterForCompletion(DomElementEvents, token.attrName)
			return items
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

			return items
		}
	}

	private makeCompletionInfo(
		items: {name: string, description: string | null, suffix?: string}[] | null,
		token: FlitToken,
	): ts.CompletionInfo | null {
		if (!items) {
			return null
		}

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
				insertText: name + (item.suffix || ''),
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

	getNonTemplateCompletions(fileName: string, offset: number): ts.CompletionInfo | null {
		let simulateToken = getSimulateTokenFromNonTemplate(fileName, offset, this.analyzer.program, this.typescript)
		if (simulateToken) {
			return this.getCompletions(simulateToken.token, simulateToken.node)
		}

		return null
	}
}


function filterForCompletion<T extends {name: string}>(items: T[], label: string): T[] {
	return items.filter(item => item.name.startsWith(label))
}


function filterBooleanAttributeForCompletion(label: string, tagName: string): BooleanAttribute[] {
	return DomBooleanAttributes.filter(item => {
		if (item.forElements && !item.forElements.includes(tagName)) {
			return false
		}

		return item.name.startsWith(label)
	})
}


function addSuffixProperty(items: {name: string, description: string | null}[], suffix: string, token: FlitToken) {
	if (suffix && token.nextTokenString.startsWith(suffix)) {
		suffix = ''
	}

	return items.map(item => ({
		name: item.name,
		description: item.description,
		suffix,
	}))
}
