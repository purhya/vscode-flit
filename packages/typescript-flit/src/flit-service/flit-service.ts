import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitTokenScanner, FlitTokenType} from './flit-toker-scanner'
import {LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {TemplateContext} from '../template-decorator'
import {FlitCompletion} from './flit-completion'
import {FlitQuickInfo} from './flit-quickinfo'
import {FlitDefinition} from './flit-definition'


/** Provide flit language service. */
export class FlitService {

	private scanner: FlitTokenScanner
	private analyzer: FlitAnalyzer
	private completion: FlitCompletion
	private quickInfo: FlitQuickInfo
	private flitDefinition: FlitDefinition

	constructor(
		private readonly typescript: typeof ts,
		tsLanguageService: ts.LanguageService,
		htmlLanguageService: HTMLLanguageService
	) {
		this.scanner = new FlitTokenScanner(htmlLanguageService)
		this.analyzer = new FlitAnalyzer(typescript, tsLanguageService)

		this.completion = new FlitCompletion(this.analyzer, this.typescript)
		this.quickInfo = new FlitQuickInfo(this.analyzer, this.typescript)
		this.flitDefinition = new FlitDefinition(this.analyzer, this.typescript)
	}

	printTokens(document: TextDocument) {
		this.scanner.printTokens(document)
	}

	/** Makesure to reload changed source files. */
	private beFresh() {
		this.analyzer.update()
	}

	getCompletions(context: TemplateContext, position: ts.LineAndCharacter): ts.CompletionInfo | null {
		let token = this.scanner.scanAt(context.document, position)
		if (!token) {
			return null
		}

		this.beFresh()

		return this.completion.getCompletions(token, context.node)
	}

	getNonTemplateCompletions(fileName: string, offset: number): ts.CompletionInfo | null {
		return this.completion.getNonTemplateCompletions(fileName, offset)
	}

	getQuickInfo(context: TemplateContext, position: ts.LineAndCharacter): ts.QuickInfo | null {
		let token = this.scanner.scanAt(context.document, position)
		if (!token) {
			return null
		}

		// <
		if (token.type === FlitTokenType.StartTagOpen) {
			return null
		}

		this.beFresh()
		
		return this.quickInfo.getQuickInfo(token, context.node)
	}

	getNonTemplateQuickInfo(fileName: string, offset: number): ts.QuickInfo | null {
		return this.quickInfo.getNonTemplateQuickInfo(fileName, offset)
	}

	getDefinition(context: TemplateContext, position: ts.LineAndCharacter): ts.DefinitionInfoAndBoundSpan | null {
		let token = this.scanner.scanAt(context.document, position)
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
		
		return this.flitDefinition.getDefinition(token, context.node)
	}
}