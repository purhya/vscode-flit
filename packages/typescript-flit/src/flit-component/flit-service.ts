import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitToken, FlitTokenScanner, FlitTokenType} from './flit-toker-scanner'
import {LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {DomElementEvents} from '../data/dom-element-events'
import {getNodeIdentifier, getNodeName} from '../ts-utils/ast-utils'
import {debug} from '../helpers/logger'
import {FlitBindingModifiers} from '../data/flit-binding-modifiers'
import {StyleProperties} from '../data/style-properties'


/** Provide flit language service. */
export class FlitService {

	private scanner: FlitTokenScanner
	private analyzer: FlitAnalyzer

	constructor(
		private readonly typescript: typeof ts,
		tsLanguageService: ts.LanguageService,
		htmlLanguageService: HTMLLanguageService
	) {
		this.scanner = new FlitTokenScanner(htmlLanguageService)
		this.analyzer = new FlitAnalyzer(typescript, tsLanguageService)
	}

	/** Makesure to reload changed source files. */
	private beFresh() {
		this.analyzer.update()
	}

	getCompletions(document: TextDocument, position: ts.LineAndCharacter): ts.CompletionInfo | null {
		let token = this.scanner.scanAt(document, position)
		if (!token) {
			return null
		}

		debug(token)
		this.beFresh()

		// <
		if (token.type === FlitTokenType.StartTagOpen) {
			let components = this.analyzer.getComponentsForCompletion('')
			let info = this.addSuffixProperty(components, '')

			return this.makeCompletionInfo(info, token)
		}

		// tag
		else if (token.type === FlitTokenType.StartTag) {
			let components = this.analyzer.getComponentsForCompletion(token.value)
			let info = this.addSuffixProperty(components, '')

			return this.makeCompletionInfo(info, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let bindings = this.analyzer.getBindingsForCompletion(token.value)
			let info = this.addSuffixProperty(bindings, '=')
			this.fixBindingCompletionInfo(info)

			if (info.length === 0) {
				info = this.giveMoreBindingCompletionInfo(token)
				debug(info)
			}

			return this.makeCompletionInfo(info, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let properties = this.analyzer.getComponentPropertiesForCompletion(token.value, token.tagName) || []
			let info = this.addSuffixProperty(properties, '=')

			return this.makeCompletionInfo(info, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let domEvents = this.getDomEventsItems(token.value)

			if (token.tagName.includes('-')) {
				let comEvents = this.analyzer.getComponentEventsForCompletion(token.value, token.tagName) || []
				let atComEvents = comEvents.map(item => ({name: '@' + item.name, description: item.description}))
				let info = this.addSuffixProperty([...atComEvents, ...domEvents], '=')

				return this.makeCompletionInfo(info, token)
			}
			else {
				let domEvents = this.getDomEventsItems(token.value)
				let info = this.addSuffixProperty(domEvents, '=')

				return this.makeCompletionInfo(info, token)
			}
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let comEvents = this.analyzer.getComponentEventsForCompletion(token.value, token.tagName) || []
			let info = this.addSuffixProperty(comEvents, '=')

			return this.makeCompletionInfo(info, token)
		}

		return null
	}

	private addSuffixProperty(items: {name: string, description: string | null}[], suffix: string) {
		return items.map(item => ({
			name: item.name,
			description: item.description,
			suffix,
		}))
	}

	private fixBindingCompletionInfo(items: {name: string, description: string | null, suffix: string}[]) {
		items.forEach(item => {
			if (item.name === 'class' || FlitBindingModifiers.hasOwnProperty(item.name)) {
				item.suffix = ''
			}
			else if (item.name === 'ref') {
				item.suffix = '=""'
			}
		})
	}

	private giveMoreBindingCompletionInfo(token: FlitToken) {
		let bindingName = token.value.replace(/\..*/, '')
		let modifier = token.value.replace(/^.+?\./, '')

		if (bindingName === 'style') {
			// Complete modifiers.
			if (modifier.includes('.')) {
				let label = modifier.replace(/.+\./, '')

				// Move cursor to `:style.font-size|.`
				token.start += 1 + bindingName.length + modifier.length
				token.prefix = '.'

				return this.addSuffixProperty(FlitBindingModifiers.style.filter(item => item.name.startsWith(label)), '=')
			}

			// Complete style property.
			else {
				// Move cursor to `:style|.`
				token.start += 1 + bindingName.length
				token.prefix = '.'

				return this.addSuffixProperty(StyleProperties.filter(item => item.name.startsWith(modifier)), '')
			}
		}
		else if (bindingName === 'model') {

			// Move cursor to `:model|.`
			token.start += 1 + bindingName.length
			token.prefix = '.'

			return this.addSuffixProperty(FlitBindingModifiers.model.filter(item => item.name.startsWith(modifier)), '=')
		}

		return []
	}

	private makeCompletionInfo(
		items: {name: string, description: string | null, suffix: string}[],
		token: FlitToken,
	): ts.CompletionInfo {
		let entries: ts.CompletionEntry[] = items.map(item => {
			let name = token.prefix + item.name
			let kind = this.getScriptElementKindFromToken(token)

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

	private getDomEventsItems(name: string) {
		return DomElementEvents.filter(event => event.name.startsWith(name))
	}

	private getDomEventItem(name: string) {
		return DomElementEvents.find(event => event.name === name) || null
	}

	getQuickInfo(document: TextDocument, position: ts.LineAndCharacter): ts.QuickInfo | null {
		let token = this.scanner.scanAt(document, position)
		if (!token) {
			return null
		}

		// <
		if (token.type === FlitTokenType.StartTagOpen) {
			return null
		}

		debug(token)
		this.beFresh()
		
		// tag
		if (token.type === FlitTokenType.StartTag) {
			let component = this.analyzer.getComponent(token.value)
			return this.makeQuickInfo(component as {name: string, type: ts.Type, description: string}, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let binding = this.analyzer.getBinding(token.value)
			return this.makeQuickInfo(binding, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let property = this.analyzer.getComponentProperty(token.value, token.tagName)
			return this.makeQuickInfo(property, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let domEvent = this.getDomEventItem(token.value)
			return this.makeQuickInfo(domEvent, token)
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let comEvent = this.analyzer.getComponentEvent(token.value, token.tagName)
			return this.makeQuickInfo(comEvent, token)
		}

		return null
	}
	
	private makeQuickInfo(
		item: {name: string, type?: ts.Type, description: string | null} | null,
		token: FlitToken
	): ts.QuickInfo | null{
		if (!item || (!item.type && !item.description)) {
			return null
		}

		let kind = this.getScriptElementKindFromToken(token)

		let textSpan: ts.TextSpan = {
			start: token.start,
			length: token.end - token.start,
		}

		let headers: ts.SymbolDisplayPart[] = []
		let documentation: ts.SymbolDisplayPart[] = []

		let headerText = token.text
		if (token.type === FlitTokenType.StartTag) {
			headerText = '<' + token.text + '>'
		}
		if (item.type) {
			headerText += ': ' + this.analyzer.getTypeDescription(item.type)
		}

		headers.push({
			kind: this.typescript.SymbolDisplayPartKind[this.getSymbolDisplayPartKindFromToken(token)],
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

	private getScriptElementKindFromToken(token: FlitToken) {
		switch (token.type) {
			case FlitTokenType.StartTagOpen:
			case FlitTokenType.StartTag:
			case FlitTokenType.Binding:
				return this.typescript.ScriptElementKind.classElement

			case FlitTokenType.Property:
				return this.typescript.ScriptElementKind.memberVariableElement

			case FlitTokenType.ComEvent:
			case FlitTokenType.DomEvent:
				return this.typescript.ScriptElementKind.functionElement
		}
	}

	private getSymbolDisplayPartKindFromToken(token: FlitToken) {
		switch (token.type) {
			case FlitTokenType.StartTagOpen:
			case FlitTokenType.StartTag:
			case FlitTokenType.Binding:
				return this.typescript.SymbolDisplayPartKind.className

			case FlitTokenType.Property:
				return this.typescript.SymbolDisplayPartKind.propertyName

			case FlitTokenType.ComEvent:
			case FlitTokenType.DomEvent:
				return this.typescript.SymbolDisplayPartKind.functionName
		}
	}

	getDefinition(document: TextDocument, position: ts.LineAndCharacter): ts.DefinitionInfoAndBoundSpan | null {
		let token = this.scanner.scanAt(document, position)
		if (!token) {
			return null
		}

		// `<` or `@@`
		if (token.type === FlitTokenType.StartTagOpen
			|| token.type === FlitTokenType.StartTag && !token.tagName.includes('-')
			|| token.type === FlitTokenType.DomEvent
		) {
			return null
		}

		debug(token)
		this.beFresh()
		
		// tag
		if (token.type === FlitTokenType.StartTag) {
			let component = this.analyzer.getComponent(token.value)
			return this.makeDefinitionInfo(component, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let binding = this.analyzer.getBinding(token.value)
			return this.makeDefinitionInfo(binding, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let property = this.analyzer.getComponentProperty(token.value, token.tagName)
			return this.makeDefinitionInfo(property, token)
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let event = this.analyzer.getComponentEvent(token.value, token.tagName)
			return this.makeDefinitionInfo(event, token)
		}

		return null
	}
	
	private makeDefinitionInfo(
		item: {name: string | null, nameNode: ts.Node | null, declaration?: ts.Declaration} | null,
		token: FlitToken
	): ts.DefinitionInfoAndBoundSpan | null{
		if (!item) {
			return null
		}

		let node = item.declaration ? getNodeIdentifier(item.declaration, this.typescript)! : item.nameNode!
		let name = item.name || getNodeName(node, this.typescript) || ''
		let kind = this.getScriptElementKindFromToken(token)
		let fileName = node.getSourceFile().fileName

		let textSpan: ts.TextSpan = {
			start: node.getStart(),
			length: node.getWidth(),
		}

		let info: ts.DefinitionInfo = {
			textSpan,
			fileName,
			kind,
			name,
			containerName: fileName,
			containerKind: this.typescript.ScriptElementKind.scriptElement,
		}

		let fromTextSpan = {
			start: token.start,
			length: token.end - token.start,
		}

		return {
			definitions: [info],
			textSpan: fromTextSpan,
		}
	}
}