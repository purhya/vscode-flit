import * as ts from 'typescript/lib/tsserverlibrary'
import * as vscode from 'vscode-languageserver-types'
import {FlitTokenScanner, FlitTokenType} from './flit-toker-scanner'
import {LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {FlitAnalyzer} from './flit-analyzer'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FlitBaseItem} from './flit-discover/types'
import {DomElementEvents} from '../internal/dom-element-events'
import {quickLog} from '../internal/logger'


/** Map of `click: description`. */
const DomElementEventsMap: Map<string, {name: string, description: string}> = new Map(DomElementEvents.map(e => [e.name, e]))


/** Provide flit language service. */
export class FlitService {

	private scanner: FlitTokenScanner
	private analyzer: FlitAnalyzer

	constructor(
		typescript: typeof ts,
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

	getCompletions(document: TextDocument, position: ts.LineAndCharacter): vscode.CompletionList | null {
		let token = this.scanner.scanAt(document, position)!
		if (!token) {
			return null
		}

		this.beFresh()

		// <
		if (token.type === FlitTokenType.StartTagOpen) {
			let components = this.analyzer.getComponentsForCompletion('')
			return this.makeCompletionList(components as FlitBaseItem[], vscode.CompletionItemKind.Class, token.range)
		}

		// tag
		if (token.type === FlitTokenType.Tag) {
			let components = this.analyzer.getComponentsForCompletion(token.value)
			return this.makeCompletionList(components as FlitBaseItem[], vscode.CompletionItemKind.Class, token.range)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let attributeName = token.value.slice(1)
			let bindings = this.analyzer.getBindingsForCompletion(attributeName)

			return this.makeCompletionList(bindings, vscode.CompletionItemKind.Class, token.range, ':', '=${}')
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let attributeName = token.value.slice(1)
			let properties = this.analyzer.getComponentPropertiesForCompletion(attributeName, token.tagName) || []

			return this.makeCompletionList(properties, vscode.CompletionItemKind.Property, token.range, '.', '=${}')
		}

		// @xxx
		else if (token.type === FlitTokenType.Event) {
			let attributeName = token.value.slice(1)

			if (token.tagName.includes('-')) {
				let events = this.analyzer.getComponentEventsForCompletion(attributeName, token.tagName) || []
				return this.makeCompletionList(events, vscode.CompletionItemKind.Event, token.range, '@', '=${}')
			}
			else {
				let domEvents = this.getDomEventsItems(attributeName)
				return this.makeCompletionList(domEvents, vscode.CompletionItemKind.Event, token.range, '@', '=${}')
			}
		}

		// @@xxx
		else if (token.type === FlitTokenType.DomEvent) {
			let attributeName = token.value.slice(2)
			let domEvents = this.getDomEventsItems(attributeName)
			return this.makeCompletionList(domEvents, vscode.CompletionItemKind.Event, token.range, '@@', '=${}')
		}

		return null
	}

	private makeCompletionList(items: {name: string, description: string | null}[], kind: vscode.CompletionItemKind, range: vscode.Range, prefix: string = '', suffix: string = ''): vscode.CompletionList {
		let completionItems: vscode.CompletionItem[] = items.map(item => {
			let label = prefix + item.name

			let textEdit = {
				range,
				newText: label + suffix
			}

			return {
				label,
				kind,
				textEdit,
				detail: item.description || undefined,
			}
		})

		return {
			isIncomplete: false,
			items: completionItems,
		}
	}

	private getDomEventsItems(name: string) {
		return DomElementEvents.filter(event => event.name.startsWith(name))
	}

	// getQuickInfo(document: TextDocument, position: ts.LineAndCharacter): vscode.Hover | null {
	// 	let token = this.scanner.scanAt(document, position)!
	// 	if (!token) {
	// 		return null
	// 	}

	// 	this.beFresh()

	// 	if (token.type === FlitTokenType.Tag) {

	// 	}
	// }
}