import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitToken, FlitTokenScanner, FlitTokenType} from './flit-toker-scanner'
import {LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {DomElementEvents} from '../helpers/dom-element-events'
import {getNodeIdentifier, getNodeName} from './ts-utils/ast-utils'


/** Provide flit language service. */
export class FlitService {

	private scanner: FlitTokenScanner
	private analyzer: FlitAnalyzer

	constructor(
		private typescript: typeof ts,
		project: ts.server.Project,
		htmlLanguageService: HTMLLanguageService,
	) {
		this.scanner = new FlitTokenScanner(htmlLanguageService)
		this.analyzer = new FlitAnalyzer(typescript, project)
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

		this.beFresh()

		// <
		if (token.type === FlitTokenType.StartTagOpen) {
			let components = this.analyzer.getComponentsForCompletion('')
			return this.makeCompletionInfo(components as {name: string, description: string}[], token)
		}

		// tag
		else if (token.type === FlitTokenType.StartTag) {
			let components = this.analyzer.getComponentsForCompletion(token.value)
			return this.makeCompletionInfo(components as {name: string, description: string}[], token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let attributeName = token.value.slice(1)
			let bindings = this.analyzer.getBindingsForCompletion(attributeName)

			return this.makeCompletionInfo(bindings, token, '=${}')
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let attributeName = token.value.slice(1)
			let properties = this.analyzer.getComponentPropertiesForCompletion(attributeName, token.tagName) || []

			return this.makeCompletionInfo(properties, token, '=${}')
		}

		// @xxx
		else if (token.type === FlitTokenType.Event) {
			let attributeName = token.value.slice(1)

			if (token.tagName.includes('-')) {
				let events = this.analyzer.getComponentEventsForCompletion(attributeName, token.tagName) || []
				return this.makeCompletionInfo(events, token, '=${}')
			}
			else {
				let domEvents = this.getDomEventsItems(attributeName)
				token.prefix = '@@'
				return this.makeCompletionInfo(domEvents, token, '=${}')
			}
		}

		// @@xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let attributeName = token.value.slice(2)
			let domEvents = this.getDomEventsItems(attributeName)
			return this.makeCompletionInfo(domEvents, token, '=${}')
		}

		return null
	}

	private makeCompletionInfo(
		items: {name: string, description: string | null}[],
		token: FlitToken,
		suffix: string = ''
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
				sortText: name,
				insertText: name + suffix,
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

		this.beFresh()
		
		// tag
		if (token.type === FlitTokenType.StartTag) {
			let component = this.analyzer.getComponent(token.value)
			return this.makeQuickInfo(component as {name: string, type: ts.Type, description: string}, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let attributeName = token.value.slice(1)
			let binding = this.analyzer.getBinding(attributeName)

			return this.makeQuickInfo(binding, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let attributeName = token.value.slice(1)
			let property = this.analyzer.getComponentProperty(attributeName, token.tagName)

			return this.makeQuickInfo(property, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.Event) {
			let attributeName = token.value.slice(1)

			if (token.tagName.includes('-')) {
				let event = this.analyzer.getComponentEvent(attributeName, token.tagName)
				return this.makeQuickInfo(event, token)
			}
			else {
				let domEvent = this.getDomEventItem(attributeName)
				return this.makeQuickInfo(domEvent, token)
			}
		}

		// @@xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let attributeName = token.value.slice(2)
			let domEvent = this.getDomEventItem(attributeName)

			return this.makeQuickInfo(domEvent, token)
		}

		return null
	}
	
	private makeQuickInfo(
		item: {name: string, type?: ts.Type, description: string | null} | null,
		token: FlitToken,
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

		if (item.type) {
			headers.push({
				kind: this.typescript.SymbolDisplayPartKind[this.getSymbolDisplayPartKindFromToken(token)],
				text: token.text + ': ' + this.analyzer.getTypeDescription(item.type),
			})
		}

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

			case FlitTokenType.Event:
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

			case FlitTokenType.Event:
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

		this.beFresh()
		
		// tag
		if (token.type === FlitTokenType.StartTag) {
			let component = this.analyzer.getComponent(token.value)
			return this.makeDefinitionInfo(component, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let attributeName = token.value.slice(1)
			let binding = this.analyzer.getBinding(attributeName)

			return this.makeDefinitionInfo(binding, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let attributeName = token.value.slice(1)
			let property = this.analyzer.getComponentProperty(attributeName, token.tagName)

			return this.makeDefinitionInfo(property, token)
		}

		// @xxx
		else if (token.type === FlitTokenType.Event) {
			let attributeName = token.value.slice(1)
			let event = this.analyzer.getComponentEvent(attributeName, token.tagName)

			return this.makeDefinitionInfo(event, token)
		}

		return null
	}
	
	private makeDefinitionInfo(
		item: {name: string | null, nameNode: ts.Node | null, declaration?: ts.Declaration} | null,
		token: FlitToken,
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