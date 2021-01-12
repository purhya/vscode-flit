import {TemplateContext, TemplateLanguageService} from 'typescript-template-language-service-decorator'
import * as ts from 'typescript/lib/tsserverlibrary'
import {LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {LanguageService as CSSLanguageService} from 'vscode-css-languageservice'
import * as vscode from 'vscode-languageserver-types'
import {VSCodeToTSTranslater} from '../internal/vscode-to-ts-translater'
import {TemplateDocumentProvider} from './template-document-provider'
import {FlitService} from '../flit-component/flit-service'
import {quickLog} from '../internal/logger'


/** Matches common template syntax like html`...` or css`...` and route them to child language service. */
export class TemplateLanguageServiceRouter implements TemplateLanguageService {

	private translater: VSCodeToTSTranslater
	private documentProvider: TemplateDocumentProvider
	private flitService: FlitService

	constructor(
		typescript: typeof ts,
		project: ts.server.Project,
		private htmlLanguageService: HTMLLanguageService,
		private cssLanguageService: CSSLanguageService,
	) {
		this.documentProvider = new TemplateDocumentProvider(htmlLanguageService, cssLanguageService)
		this.translater = new VSCodeToTSTranslater(typescript)
		this.flitService = new FlitService(typescript, project, htmlLanguageService)

		quickLog('Typescript Flit Plugin Started')
	}

	/** param `position` is local template position. */
	getDefinitionAtPosition(_context: TemplateContext, _position: ts.LineAndCharacter): ts.DefinitionInfo[] {
		return []
	}

	getCompletionsAtPosition(context: TemplateContext, position: ts.LineAndCharacter): ts.CompletionInfo {
		this.documentProvider.updateContext(context)
		let completions = this.getVSCodeCompletionItems(position)

		return this.translater.translateCompletion(completions, context)
	}

	private getVSCodeCompletionItems(position: ts.LineAndCharacter) {
		let document = this.documentProvider.getDocumentAt(position)
		let completions: vscode.CompletionList

		let emptyCompletionList: vscode.CompletionList = {
			isIncomplete: false,
			items: [],
		}

		if (document.languageId === 'html') {
			let htmlDocument = this.documentProvider.getHTMLDocument()
			completions = this.htmlLanguageService.doComplete(document, position, htmlDocument) || emptyCompletionList
		}
		else if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			completions = this.cssLanguageService.doComplete(document, position, stylesheet) || emptyCompletionList
		}
		else {
			completions = emptyCompletionList
		}
		
		if (document.languageId === 'html') {
			let flitCompletions = this.flitService.getCompletions(document, position)
			if (flitCompletions) {
				completions.items.push(...flitCompletions.items)
			}
		}

		return completions
	}

	getCompletionEntryDetails(context: TemplateContext, position: ts.LineAndCharacter, name: string): ts.CompletionEntryDetails {
		this.documentProvider.updateContext(context)

		let completions = this.getVSCodeCompletionItems(position)
		let item = completions.items.find(x => x.label === name)
		if (!item) {
			item = {label: name}
		}

		return this.translater.translateCompletionToEntryDetails(item)
	}

	getQuickInfoAtPosition(context: TemplateContext, position: ts.LineAndCharacter ): ts.QuickInfo | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)
		let hover: vscode.Hover | null = null

		if (document.languageId === 'html') {
			let htmlDocument = this.documentProvider.getHTMLDocument()
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

			return this.translater.translateDiagnostics(diagnostics, document, context)
		}
		else {
			return []
		}
	}

	getCodeFixesAtPosition(context: TemplateContext, start: number, end: number): ts.CodeAction[] {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocument()

		if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			let range = this.toVsRange(context, start, end)

			let diagnostics = this.cssLanguageService.doValidation(document, stylesheet)
				.filter(diagnostic => this.isRangeOverlaps(diagnostic.range, range))

			let codeActions = this.cssLanguageService.doCodeActions(document, range, { diagnostics }, stylesheet)

			return this.translater.translateCodeActions(
				codeActions,
				context,
			)
		}
		else {
			return []
		}
	}

	private toVsRange(context: TemplateContext, start: number, end: number): vscode.Range {
		return {
			start: context.toPosition(start),
			end: context.toPosition(end),
		}
	}

	private isRangeOverlaps(a: vscode.Range, b: vscode.Range): boolean {
		return !this.isPositionAfter(a.end, b.start) && !this.isPositionAfter(b.end, a.start)
	}

	private isPositionAfter(left: vscode.Position, right: vscode.Position): boolean {
		return right.line > left.line || (right.line === left.line && right.character >= left.character)
	}

	getReferencesAtPosition(context: TemplateContext, position: ts.LineAndCharacter): ts.ReferenceEntry[] | undefined {
		this.documentProvider.updateContext(context)
		let document = this.documentProvider.getDocumentAt(position)

		if (document.languageId === 'html') {
			let htmlDocument = this.documentProvider.getHTMLDocument()
			let highlights = this.htmlLanguageService.findDocumentHighlights(document, position, htmlDocument)

			return highlights.map(highlight => ({
				fileName: context.fileName,
				textSpan: this.translater.toTsSpan(highlight.range, context),
			} as ts.ReferenceEntry))
		}
		else if (document.languageId === 'css') {
			let stylesheet = this.documentProvider.getStylesheet()
			let highlights = this.cssLanguageService.findDocumentHighlights(document, position, stylesheet)

			return highlights.map(highlight => ({
				fileName: context.fileName,
				textSpan: this.translater.toTsSpan(highlight.range, context),
			} as ts.ReferenceEntry))
		}
		else {
			return undefined
		}
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
		else {
			return undefined
		}
	}
}
