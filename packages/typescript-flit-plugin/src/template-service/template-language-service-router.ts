import * as ts from 'typescript/lib/tsserverlibrary'
import {LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {LanguageService as CSSLanguageService} from 'vscode-css-languageservice'
import * as vscode from 'vscode-languageserver-types'
import {VSCodeTSTranslater} from '../helpers/vscode-ts-translater'
import {TemplateDocumentProvider} from './template-document-provider'
import {FlitService} from '../flit-component/flit-service'
import {debug, quickLog} from '../helpers/logger'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {TemplateContext, TemplateLanguageService} from '../template-decorator'


/** Matches common template syntax like html`...` or css`...` and route them to child language service. */
export class TemplateLanguageServiceRouter implements TemplateLanguageService {

	private translater: VSCodeTSTranslater
	private documentProvider: TemplateDocumentProvider
	private flitService: FlitService

	constructor(
		typescript: typeof ts,
		tsLanguageService: ts.LanguageService,
		private readonly htmlLanguageService: HTMLLanguageService,
		private readonly cssLanguageService: CSSLanguageService
	) {
		this.documentProvider = new TemplateDocumentProvider(htmlLanguageService, cssLanguageService)
		this.translater = new VSCodeTSTranslater(typescript)
		this.flitService = new FlitService(typescript, tsLanguageService, htmlLanguageService)

		quickLog('Typescript Flit Plugin Started')
	}

	getCompletionsAtPosition(context: TemplateContext, position: ts.LineAndCharacter): ts.CompletionInfo | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)
		let tsCompletions: ts.CompletionInfo = this.translater.getEmptyCompletion()

		if (document.languageId === 'html') {
			let flitCompletions = this.flitService.getCompletions(document, position)
			if (flitCompletions) {
				tsCompletions.entries.push(...flitCompletions.entries)
			}
		}

		let completions = this.getVSCodeCompletionItems(document, position)
		if (completions) {
			let vsCompletions = this.translater.translateCompletion(completions, context)
			if (vsCompletions) {
				tsCompletions.entries.push(...vsCompletions.entries)
			}
		}

		return tsCompletions
	}

	getCompletionEntryDetails(context: TemplateContext, position: ts.LineAndCharacter, name: string): ts.CompletionEntryDetails | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)

		if (document.languageId === 'html') {
			let flitCompletions = this.flitService.getCompletions(document, position)
			if (flitCompletions) {
				let flitCompletionEntry = flitCompletions.entries.find(entry => entry.name == name)
				if (flitCompletionEntry) {
					return this.translater.translateTSCompletionEntryToEntryDetails(flitCompletionEntry)
				}
			}
		}

		let completions = this.getVSCodeCompletionItems(document, position)
		let item = completions?.items.find(x => x.label === name)
		if (item) {
			return this.translater.translateCompletionToEntryDetails(item)
		}

		return undefined
	}

	private getVSCodeCompletionItems(document: TextDocument, position: ts.LineAndCharacter) {
		let completions: vscode.CompletionList | undefined

		if (document.languageId === 'html') {
			let htmlDocument = this.documentProvider.getHTMLDocument()
			completions = this.htmlLanguageService.doComplete(document, position, htmlDocument)
		}
		else if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			completions = this.cssLanguageService.doComplete(document, position, stylesheet)
		}

		return completions
	}

	getQuickInfoAtPosition(context: TemplateContext, position: ts.LineAndCharacter ): ts.QuickInfo | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)
		let hover: vscode.Hover | null = null

		if (document.languageId === 'html') {
			let htmlDocument = this.documentProvider.getHTMLDocument()
			let tsHover = this.flitService.getQuickInfo(document, position)
			if (tsHover) {
				return tsHover
			}

			hover = this.htmlLanguageService.doHover(document, position, htmlDocument)
		}
		else if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			hover = this.cssLanguageService.doHover(document, position, stylesheet)
		}

		if (hover) {
			return this.translater.translateHover(hover, position, context)
		}

		return undefined
	}

	getGlobalDefinitionAndBoundSpan(context: TemplateContext, position: ts.LineAndCharacter): ts.DefinitionInfoAndBoundSpan | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)

		if (document.languageId === 'html') {
			let flitDefinitions = this.flitService.getDefinition(document, position)
			if (flitDefinitions) {
				debug(flitDefinitions)
				return flitDefinitions
			}
		}

		return undefined
	}

	getOutliningSpans(context: TemplateContext): ts.OutliningSpan[] {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocument()
		let ranges: vscode.FoldingRange[] = []

		if (document.languageId === 'html') {
			ranges = this.htmlLanguageService.getFoldingRanges(document)
		}
		else if (document.languageId === 'css') {
			ranges = this.cssLanguageService.getFoldingRanges(document)
		}

		return ranges.map(range => this.translater.translateOutliningSpan(range, context))
	}

	getSemanticDiagnostics(context: TemplateContext): ts.Diagnostic[] {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocument()

		if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			let diagnostics = this.cssLanguageService.doValidation(document, stylesheet)

			return this.translater.translateDiagnostics(diagnostics, context)
		}

		return []
	}

	getCodeFixesAtPosition(context: TemplateContext, start: number, end: number): ts.CodeFixAction[] {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocument()

		if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			let range = this.translater.toVsRange(context, start, end)

			let diagnostics = this.cssLanguageService.doValidation(document, stylesheet)
				.filter(diagnostic => this.translater.isVSRangeOverlaps(diagnostic.range, range))

			let codeActions = this.cssLanguageService.doCodeActions(document, range, {diagnostics}, stylesheet)

			return this.translater.translateCodeFixActions(
				codeActions,
				context
			)
		}

		return []
	}

	getGlobalReferencesAtPosition(context: TemplateContext, position: ts.LineAndCharacter): ts.ReferencedSymbol[] | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)
		let highlights: vscode.DocumentHighlight[] | undefined

		if (document.languageId === 'html') {
			let htmlDocument = this.documentProvider.getHTMLDocument()
			highlights = this.htmlLanguageService.findDocumentHighlights(document, position, htmlDocument)

			return this.translater.translateHighlightsToGlobalReferenceSymbol(highlights, position, context)
		}
		else if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			highlights = this.cssLanguageService.findDocumentHighlights(document, position, stylesheet)
		}

		if (highlights) {
			return this.translater.translateHighlightsToGlobalReferenceSymbol(highlights, position, context)
		}

		return undefined
	}

	getJsxClosingTagAtPosition(context: TemplateContext, position: ts.LineAndCharacter): ts.JsxClosingTagInfo | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)

		if (document.languageId === 'html') {
			let htmlDocument = this.documentProvider.getHTMLDocument()
			let tagComplete = this.htmlLanguageService.doTagComplete(document, position, htmlDocument)

			if (!tagComplete) {
				return undefined
			}

			// HTML returns completions with snippet placeholders. Strip these out.
			return {
				newText: tagComplete.replace(/\$\d/g, ''),
			}
		}

		return undefined
	}
}
