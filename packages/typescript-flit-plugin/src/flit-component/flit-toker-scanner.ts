import {LanguageService as HTMLLanguageService, TokenType} from 'vscode-html-languageservice'
import {TextDocument} from 'vscode-languageserver-textdocument'
import * as vscode from 'vscode-languageserver-types'


export interface FlitToken {
	type: FlitTokenType
	value: string
	tagName: string
	range: vscode.Range
}

export enum FlitTokenType {
	StartTagOpen,
	Tag,
	Binding,
	Property,
	DomEvent,
	Event,
}


export class FlitTokenScanner {

	constructor(
		private htmlLanguageService: HTMLLanguageService
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
		let value = scanner.getTokenText()

		if (token === TokenType.StartTagOpen) {
			type = FlitTokenType.StartTagOpen
			tagName = ''
		}
		else if (token === TokenType.StartTag) {
			type = FlitTokenType.Tag
		}
		else if (token === TokenType.AttributeName && tagName !== null) {
			if (value[0] === ':') {
				type = FlitTokenType.Binding
			}
			else if (value[0] === '.') {
				type = FlitTokenType.Property
			}
			else if (value[0] === '@' && value[1] === '@') {
				type = FlitTokenType.DomEvent
			}
			else if (value[0] === '@') {
				type = FlitTokenType.Event
			}
		}
		
		if (type !== null) {
			let end = scanner.getTokenEnd()
			let start = scanner.getTokenOffset()

			if (type === FlitTokenType.StartTagOpen) {
				start = end
			}
			
			let range = vscode.Range.create(document.positionAt(start), document.positionAt(end))

			return {
				type,
				value,
				tagName,
				range,
			}
		}

		return null
	}
}