import {TemplateContext} from 'typescript-template-language-service-decorator'
import * as ts from 'typescript/lib/tsserverlibrary'
import {HTMLDocument, LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {LanguageService as CSSLanguageService, Stylesheet} from 'vscode-css-languageservice'
import {HTMLEmbeddedRegionParser, HTMLEmbeddedRegions} from './html-embedded-region-parser'
import {TextDocument} from 'vscode-languageserver-textdocument'


export class TemplateDocumentProvider {

	private embeddedParser: HTMLEmbeddedRegionParser

	/** Last context when generating document. */
	private lastContext: TemplateContext | null = null

	/** Current HTML or CSS type TextDocument. */
	private document: TextDocument | null = null
	
	/** Regions after parsed HTML type TextDocument. */
	private embeddedRegions: HTMLEmbeddedRegions | null = null

	/** Current embedded CSS document. */
	private embeddedCSSDocument: TextDocument | null = null

	/** Current parsed HTMLDocument. */
	private htmlDocument: HTMLDocument | null = null

	/** Current parsed HTMLDocument. */
	private stylesheet: Stylesheet | null = null

	constructor(
		private htmlLanguageService: HTMLLanguageService,
		private cssLanguageService: CSSLanguageService
	) {
		this.embeddedParser = new HTMLEmbeddedRegionParser(htmlLanguageService)
	}

	/** Update context once you capture new context. */
	updateContext(context: TemplateContext) {
		if (!this.isDocumentValid(context)) {
			this.clear()
			this.createDocument(context)
		}

		this.lastContext = context
	}

	/** 
	 * Create document from curent position.
	 * The param position of returned document has been mapped to local template position.
	 */
	private createDocument(context: TemplateContext) {
		let node = context.node as ts.NoSubstitutionTemplateLiteral
		let tagNode = node.parent as ts.TaggedTemplateExpression
		let templateType = tagNode.tag.getText()

		if (templateType === 'html') {
			this.document = TemplateDocumentCreater.createHTMLDocument(context)
			this.embeddedRegions = this.embeddedParser.parse(this.document)
		}
		else {
			this.document = TemplateDocumentCreater.createCSSDocument(context)
		}
	}

	private isDocumentValid(context: TemplateContext) {
		return this.document
			&& this.lastContext
			&& this.lastContext.text === context.text
	}

	private clear() {
		this.document = null
		this.embeddedRegions = null
		this.embeddedCSSDocument = null
		this.htmlDocument = null
		this.stylesheet = null
	}

	/** Get current document from cache, or create new. */
	getDocument() {
		return this.document!
	}

	/** Get document at position, may returns embedded CSS document. */
	getDocumentAt(position: ts.LineAndCharacter) {
		let languageId = this.document!.languageId
		if (languageId === 'html') {
			let languageAtPosition = this.embeddedRegions!.getLanguageAtPosition(position)

			if (languageAtPosition === 'html') {
				return this.document!
			}
			else if (languageAtPosition === 'css') {
				if (!this.embeddedCSSDocument) {
					this.embeddedCSSDocument = TemplateDocumentCreater.createEmbeddedCSSDocument(this.lastContext!, this.embeddedRegions!)
				}

				return this.embeddedCSSDocument
			}
			else {
				throw new Error(`Not allowed to include javascript codes insode html template string`)
			}
		}
		else {
			return this.document!
		}
	}

	/** Get parsed HTMLDocument. */
	getHTMLDocument() {
		if (!this.htmlDocument) {
			this.htmlDocument = this.htmlLanguageService.parseHTMLDocument(this.document!)
		}

		return this.htmlDocument
	}

	/** Get parsed Stylesheet. */
	getStylesheet() {
		if (!this.stylesheet) {
			let languageId = this.document!.languageId
			if (languageId === 'html') {
				this.stylesheet = this.cssLanguageService.parseStylesheet(this.embeddedCSSDocument!)
			}
			else {
				this.stylesheet = this.cssLanguageService.parseStylesheet(this.document!)
			}
		}

		return this.stylesheet
	}
}


namespace TemplateDocumentCreater {

	/** 
	 * Create a html document from template context.
	 * The returned document will also map it's local offset to global position.
	 */
	export function createHTMLDocument(context: TemplateContext) {
		return createDocument(context, context.text, 'html')
	}


	/** Create a css document from template context. */
	export function createCSSDocument(context: TemplateContext) {
		return createDocument(context, context.text, 'css')
	}

	
    /** Create a embedded css document from template context. */
	export function createEmbeddedCSSDocument(context: TemplateContext, documentRegions: HTMLEmbeddedRegions) {
		let text = documentRegions.getEmbeddedDocumentContent('css')
		return createDocument(context, text, 'css')
	}


	function createDocument(_context: TemplateContext, text: string, languageId: string) {
		return TextDocument.create(`untitled://embedded.${languageId}`, languageId, 1, text)
	}
}
