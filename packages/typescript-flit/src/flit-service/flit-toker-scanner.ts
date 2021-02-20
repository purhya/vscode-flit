import {LanguageService as HTMLLanguageService, TokenType} from 'vscode-html-languageservice'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {mayDebug, quickLog} from '../helpers/logger'


/** The token object is modifiable. */
export interface FlitToken {

	/** Type of token. */
	type: FlitTokenType

	/** Closest ancestor custom tag. */
	closestCustomTagName: string | null

	/** Tag name current token inside of. */
	tagName: string

	/** Token prefix like `.`, `@`, `:`. */
	attrPrefix: string

	/** Token value without token prefix. */
	attrName: string

	/** Current attribute value like `"v"` inside `:ref="v"`, wrapped in quotes, be `null` cursor if not in an attribute value. */
	attrValue: string | null

	/** Start offset of current token. */
	start: number

	/** End offset of current token. */
	end: number

	/** Cursor offset relative to token start. */
	cursorOffset: number
}

export enum FlitTokenType {
	StartTagOpen,
	StartTag,
	Binding,
	Property,
	BooleanAttribute,
	DomEvent,
	ComEvent,
}


export class FlitTokenScanner {

	constructor(
		private readonly htmlLanguageService: HTMLLanguageService
	) {}
	
	scanAt(document: TextDocument, position: ts.LineAndCharacter): FlitToken | null {
		let offset = document.offsetAt(position)
		let scanner = this.htmlLanguageService.createScanner(document.getText())
		let token = scanner.scan()
		let tagName: string | null = null
		let attrName: string | null = null

		// `<c-1><c-2><div>`
		// when meet `c-2`, it's closest custom tag is still `c-1`
		let closestCustomTagName: string | null = null
		let lastTagName: string | null = null

		while (token !== TokenType.EOS) {
			if (token === TokenType.StartTag) {
				tagName = scanner.getTokenText()

				if (lastTagName?.includes('-')) {
					closestCustomTagName = lastTagName
				}

				lastTagName = tagName
			}
			else if (token === TokenType.AttributeName) {
				attrName = scanner.getTokenText()
			}

			if (scanner.getTokenEnd() >= offset) {
				break
			}

			token = scanner.scan()
		}

		if (!tagName) {
			return null
		}

		let type: FlitTokenType | null = null
		let prefix = ''
		let value = ''
		let attrValue: string | null = null

		// `<`
		if (token === TokenType.StartTagOpen) {
			type = FlitTokenType.StartTagOpen
			tagName = ''
		}

		// `<tag`
		else if (token === TokenType.StartTag) {
			type = FlitTokenType.StartTag
			value = tagName
		}

		// `:class` or `:class=""`
		else if (tagName && attrName) {
			if (attrName[0] === ':') {
				type = FlitTokenType.Binding
				prefix = ':'
			}
			else if (attrName[0] === '.') {
				type = FlitTokenType.Property
				prefix = '.'
			}
			else if (attrName[0] === '?') {
				type = FlitTokenType.BooleanAttribute
				prefix = '?'
			}
			else if (attrName[0] === '@' && attrName[1] === '@') {
				type = FlitTokenType.ComEvent
				prefix = '@@'
			}
			else if (attrName[0] === '@') {
				type = FlitTokenType.DomEvent
				prefix = '@'
			}

			value = attrName.slice(prefix.length)

			if (token === TokenType.AttributeValue) {
				attrValue = scanner.getTokenText()
			}
		}
		
		if (type !== null) {
			let end = scanner.getTokenEnd()
			let start = scanner.getTokenOffset()
	
			if (type === FlitTokenType.StartTagOpen) {
				start = end
			}
			
			let result: FlitToken = {
				type,
				attrPrefix: prefix,
				attrName: value,
				tagName,
				closestCustomTagName,
				attrValue,
				start,
				end,
				cursorOffset: offset - start,
			}

			mayDebug(() => result)

			return result
		}

		return null
	}

	/** print tokens for debugging. */
	printTokens(document: TextDocument) {
		let scanner = this.htmlLanguageService.createScanner(document.getText())
		let token = scanner.scan()

		while (token !== TokenType.EOS) {
			quickLog({
				type: TokenType[token],
				text: scanner.getTokenText(),
				start: scanner.getTokenOffset(),
				end: scanner.getTokenEnd(),
			})

			token = scanner.scan()
		}
	}
}