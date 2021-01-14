import {LanguageService as HTMLLanguageService, TokenType} from 'vscode-html-languageservice'
import {TextDocument} from 'vscode-languageserver-textdocument'


export interface FlitToken {

	/** Type of token. */
	type: FlitTokenType

	/** Token text like `.property`. */
	text: string

	/** Token prefix like `.`, `@`, `:`. */
	prefix: string

	/** Token value with token prefix. */
	value: string

	/** Tag name current token inside of. */
	tagName: string

	/** Start offset of current token. */
	start: number

	/** End offset of current token. */
	end: number
}

export enum FlitTokenType {
	StartTagOpen,
	StartTag,
	Binding,
	Property,
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

		while (token !== TokenType.EOS) {
			if (token === TokenType.StartTag) {
				tagName = scanner.getTokenText()
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
		let text = scanner.getTokenText()
		let prefix = ''
		let value = text

		if (token === TokenType.StartTagOpen) {
			type = FlitTokenType.StartTagOpen
			tagName = ''
			value = ''
		}
		else if (token === TokenType.StartTag) {
			type = FlitTokenType.StartTag
		}
		else if (token === TokenType.AttributeName && tagName !== null) {
			if (text[0] === ':') {
				type = FlitTokenType.Binding
				prefix = ':'
			}
			else if (text[0] === '.') {
				type = FlitTokenType.Property
				prefix = '.'
			}
			else if (text[0] === '@' && text[1] === '@') {
				type = FlitTokenType.ComEvent
				prefix = '@@'
			}
			else if (text[0] === '@') {
				type = FlitTokenType.DomEvent
				prefix = '@'
			}
		}
		
		if (type !== null) {
			let end = scanner.getTokenEnd()
			let start = scanner.getTokenOffset()
			value = text.slice(prefix.length)

			if (type === FlitTokenType.StartTagOpen) {
				start = end
			}
			
			return {
				type,
				text,
				prefix,
				value,
				tagName,
				start,
				end,
			}
		}

		return null
	}
}