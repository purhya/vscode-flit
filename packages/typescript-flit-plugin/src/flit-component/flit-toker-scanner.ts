import {LanguageService as HTMLLanguageService, TokenType} from 'vscode-html-languageservice'
import {TextDocument} from 'vscode-languageserver-textdocument'


export interface FlitToken {
	type: FlitTokenType
	text: string
	prefix: string
	value: string
	tagName: string
	start: number
	end: number
}

export enum FlitTokenType {
	StartTagOpen,
	StartTag,
	Binding,
	Property,
	DomEvent,
	Event,
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
			if (value[0] === ':') {
				type = FlitTokenType.Binding
				prefix = value[0]
			}
			else if (value[0] === '.') {
				type = FlitTokenType.Property
				prefix = value[0]
			}
			else if (value[0] === '@' && value[1] === '@') {
				type = FlitTokenType.DomEvent
				prefix = value.slice(2)
			}
			else if (value[0] === '@') {
				type = FlitTokenType.Event
				prefix = value[0]
			}
		}
		
		if (type !== null) {
			let end = scanner.getTokenEnd()
			let start = scanner.getTokenOffset()

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