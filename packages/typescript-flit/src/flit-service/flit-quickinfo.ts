import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitToken, FlitTokenType} from './flit-toker-scanner'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {FlitBindingModifiers} from '../data/flit-binding-modifiers'
import {StyleProperties} from '../data/style-properties'
import {TemplateContext} from '../template-decorator'
import {getScriptElementKindFromToken, getSymbolDisplayPartKindFromToken, splitPropertyAndModifiers} from './utils'
import {DomElementEvents} from '../data/dom-element-events'
import {FlitDomEventModifiers, FlitEventCategories} from '../data/flit-dom-event-modifiers'
import {DomBooleanAttributes} from '../data/dom-boolean-attributes'
import {findNodeAscent} from '../ts-utils/ast-utils'


/** Provide flit quickinfo service. */
export class FlitQuickInfo {

	constructor(
		private readonly analyzer: FlitAnalyzer,
		private readonly typescript: typeof ts
	) {}
	
	getQuickInfo(token: FlitToken, context: TemplateContext): ts.QuickInfo | null {
		// tag
		if (token.type === FlitTokenType.StartTag) {
			let component = this.analyzer.getComponent(token.attrName)
			return this.makeQuickInfo(component as {name: string, type: ts.Type, description: string}, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let binding = this.getBindingQuickInfoItems(token, context)
			return this.makeQuickInfo(binding, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let property = this.analyzer.getComponentProperty(token.attrName, token.tagName)
			return this.makeQuickInfo(property, token)
		}

		// ?xxx
		else if (token.type === FlitTokenType.BooleanAttribute) {
			let property = FindBooleanAttributeForQuickInfo(token.attrName, token.tagName)
			return this.makeQuickInfo(property, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let domEvent = this.getEventQuickInfoItems(token)
			return this.makeQuickInfo(domEvent, token)
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let comEvent = this.analyzer.getComponentEvent(token.attrName, token.tagName)
			return this.makeQuickInfo(comEvent, token)
		}

		return null
	}
	
	private getBindingQuickInfoItems(token: FlitToken, context: TemplateContext) {
		let [bindingName, modifiers] = splitPropertyAndModifiers(token.attrName)

		// If `:ref="|"`.
		if (token.attrValue !== null && ['ref', 'slot'].includes(token.attrName)) {
			let attrValue = token.attrValue.replace(/^['"](.*?)['"]$/, '$1')
			let componentPropertyName = token.attrName + 's' as 'refs' | 'slots'
			let customTagName: string | null = null

			token.attrPrefix = '.'
			token.attrName = componentPropertyName + '.' + attrValue

			// Get ancestor class declaration.
			if (token.attrName === 'ref') {
				let declaration = findNodeAscent(context.node, child => this.typescript.isClassLike(child)) as ts.ClassLikeDeclaration
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

			let item = this.analyzer.getSubProperties(componentPropertyName, attrValue, customTagName)
			if (item) {
				return item
			}
		}

		// `:show`, without modifiers.
		if (modifiers.length === 0) {
			return this.analyzer.getBinding(token.attrName)
		}

		// In `:style` range part.
		if (token.cursorOffset < 1 + bindingName.length) {
			token.end = token.start + 1 + bindingName.length
			token.attrName = bindingName

			return this.analyzer.getBinding(token.attrName)
		}
		
		if (bindingName === 'style') {
			
			// in `.style-property` range.
			if (token.cursorOffset < 1 + bindingName.length + 1 + modifiers[0].length) {

				// Move start and end to `:style|.style-property|.`
				token.start += 1 + bindingName.length
				token.end = token.start + 1 + modifiers[0].length
				token.attrPrefix = '.'
				token.attrName = modifiers[0]

				return findForQuickInfo(StyleProperties, modifiers[0]) || null
			}

			// in `.px` range.
			else {

				// Move start to `:style.style-property|.`
				token.start += 1 + bindingName.length + 1 + modifiers[0].length
				token.attrPrefix = '.'
				token.attrName = modifiers[1]

				return findForQuickInfo(FlitBindingModifiers.style, modifiers[1]) || null
			}
		}

		else if (bindingName === 'model') {
			let modifierStart = 1 + bindingName.length
			let matchModifier = ''

			for (let modifier of modifiers) {
				let modifierEnd = modifierStart + 1 + modifier.length
				if (modifierEnd > token.cursorOffset) {
					matchModifier = modifier
					break
				}

				modifierStart = modifierEnd
			}

			// Move start and end to `:model???|.number|...`
			token.start += modifierStart
			token.end = token.start + 1 + matchModifier.length
			token.attrPrefix = '.'
			token.attrName = matchModifier

			return findForQuickInfo(FlitBindingModifiers.model, matchModifier) || null
		}

		return null
	}
	
	private getEventQuickInfoItems(token: FlitToken) {
		let [eventName, modifiers] = splitPropertyAndModifiers(token.attrName)
		
		// `@click`, without modifiers.
		if (modifiers.length === 0) {
			return findForQuickInfo(DomElementEvents, token.attrName)
		}

		// In `@click` range part.
		if (token.cursorOffset < 1 + eventName.length) {
			token.end = token.start + 1 + eventName.length
			token.attrName = eventName

			return findForQuickInfo(DomElementEvents, token.attrName)
		}
		
		// In `@click.l|???`
		else {
			let modifierStart = 1 + eventName.length
			let matchModifier = ''

			for (let modifier of modifiers) {
				let modifierEnd = modifierStart + 1 + modifier.length
				if (modifierEnd > token.cursorOffset) {
					matchModifier = modifier
					break
				}

				modifierStart = modifierEnd
			}

			// Move start and end to `@click???|.number|...`
			token.start += modifierStart
			token.end = token.start + 1 + matchModifier.length
			token.attrPrefix = '.'
			token.attrName = matchModifier

			let item = findForQuickInfo(FlitDomEventModifiers.global, matchModifier)
			let category = FlitEventCategories[eventName]

			if (!item) {
				item = findForQuickInfo(FlitDomEventModifiers[category], matchModifier)
			}
			
			return item
		}
	}

	private makeQuickInfo(
		item: {name: string, type?: ts.Type, description: string | null} | null,
		token: FlitToken
	): ts.QuickInfo | null{
		if (!item || (!item.type && !item.description)) {
			return null
		}

		let kind = getScriptElementKindFromToken(token, this.typescript)

		let textSpan: ts.TextSpan = {
			start: token.start,
			length: token.end - token.start,
		}

		let headers: ts.SymbolDisplayPart[] = []
		let documentation: ts.SymbolDisplayPart[] = []
		let headerText = token.attrPrefix + token.attrName

		if (token.type === FlitTokenType.StartTag) {
			headerText = '<' + headerText + '>'
		}
		if (item.type) {
			headerText += ': ' + this.analyzer.getTypeDescription(item.type)
		}

		headers.push({
			kind: this.typescript.SymbolDisplayPartKind[getSymbolDisplayPartKindFromToken(token, this.typescript)],
			text: headerText,
		})

		if (item.description) {
			documentation.push({
				kind: 'text',
				text: item.description,
			})
		}

		let info: ts.QuickInfo = {
			kind,
			kindModifiers: '',
			textSpan,
			displayParts: headers,
			documentation,
		}

		return info
	}
}


function findForQuickInfo<T extends {name: string}>(items: T[], label: string): T | null {
	return items.find(item => item.name === label) || null
}


function FindBooleanAttributeForQuickInfo(label: string, tagName: string): BooleanAttribute | null {
	return DomBooleanAttributes.find(item => {
		if (item.forElements && !item.forElements.includes(tagName)) {
			return false
		}

		return item.name.startsWith(label)
	}) || null
}
