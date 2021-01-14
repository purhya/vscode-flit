import * as ts from 'typescript/lib/tsserverlibrary'
import {HTMLDocument, LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {LanguageService as CSSLanguageService, Stylesheet} from 'vscode-css-languageservice'
import {HTMLEmbeddedRegionParser, HTMLEmbeddedRegions} from '../helpers/html-embedded-region-parser'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {TemplateContext} from '../template-decorator'


interface DocumentCacheItem {

	/** Current HTML or CSS type TextDocument. */
	document: TextDocument
	
	/** Regions after parsed HTML type TextDocument. */
	embeddedRegions: HTMLEmbeddedRegions | null

	/** Current embedded CSS document. */
	embeddedCSSDocument: TextDocument | null

	/** Current parsed HTMLDocument. */
	htmlDocument: HTMLDocument | null

	/** Current parsed HTMLDocument. */
	stylesheet: Stylesheet | null
}


export class TemplateDocumentProvider {

	private embeddedParser: HTMLEmbeddedRegionParser
	private cache: WeakMap<TemplateContext, DocumentCacheItem> = new WeakMap()
	private current: DocumentCacheItem | null = null

	constructor(
		private readonly htmlLanguageService: HTMLLanguageService,
		private readonly cssLanguageService: CSSLanguageService
	) {
		this.embeddedParser = new HTMLEmbeddedRegionParser(htmlLanguageService)
	}

	/** Update context once you capture new context. */
	updateContext(context: TemplateContext) {
		let item = this.cache.get(context)

		if (!item || item.document !== context.document) {
			item = this.createItem(context)
			this.cache.set(context, item)
		}

		this.current = item
	}

	/** 
	 * Create document from curent position.
	 * The param position of returned document has been mapped to local template position.
	 */
	private createItem(context: TemplateContext) {
		let item: DocumentCacheItem = {
			document: context.document,
			embeddedRegions: null,
			embeddedCSSDocument: null,
			htmlDocument:  null,
			stylesheet: null,
		}

		let node = context.node as ts.NoSubstitutionTemplateLiteral
		let tagNode = node.parent as ts.TaggedTemplateExpression
		let templateType = tagNode.tag.getText()

		if (templateType === 'html') {
			item.embeddedRegions = this.embeddedParser.parse(context.document)
		}

		return item
	}

	/** Get current document from cache, or create new. */
	getDocument() {
		return this.current!.document
	}

	/** Get document at position, may returns embedded CSS document. */
	getDocumentAt(position: ts.LineAndCharacter) {
		let current = this.current!
		let languageId = this.current!.document.languageId

		if (languageId === 'html') {
			let languageAtPosition = current.embeddedRegions!.getLanguageAtPosition(position)

			if (languageAtPosition === 'html') {
				return current.document
			}
			else if (languageAtPosition === 'css') {
				if (!current.embeddedCSSDocument) {
					current.embeddedCSSDocument = this.createEmbeddedCSSDocument()
				}

				return current.embeddedCSSDocument
			}
			else {
				throw new Error(`Not allowed to include javascript codes insode html template string`)
			}
		}
		else {
			return current.document
		}
	}

	/** Create a embedded css document from template context. */
	private createEmbeddedCSSDocument() {
		let current = this.current!
		let text = current.embeddedRegions!.getEmbeddedDocumentContent('css')

		return TextDocument.create(`untitled://embedded.css`, 'css', 1, text)
	}

	/** Get parsed HTMLDocument. */
	getHTMLDocument() {
		let current = this.current!

		if (!current.htmlDocument) {
			current.htmlDocument = this.htmlLanguageService.parseHTMLDocument(current.document)
		}

		return current.htmlDocument
	}

	/** Get parsed Stylesheet. */
	getStylesheet() {
		let current = this.current!

		if (!current.stylesheet) {
			let languageId = current.document.languageId
			if (languageId === 'html') {
				current.stylesheet = this.cssLanguageService.parseStylesheet(current.embeddedCSSDocument!)
			}
			else {
				current.stylesheet = this.cssLanguageService.parseStylesheet(current.document)
			}
		}

		return current.stylesheet
	}
}

