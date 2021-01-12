import {Position, LanguageService as HTMLLanguageService, TokenType} from 'vscode-html-languageservice'
import {TextDocument} from 'vscode-languageserver-textdocument'


interface EmbeddedRegion {

	/** `css` or `javascript`. */
	languageId: string
	
	/** Start location. */
	start: number
	
	/** End location. */
	end: number
}


export class HTMLEmbeddedRegionParser {

	constructor(
		private languageService: HTMLLanguageService
	) {}

	parse(document: TextDocument) {
		let regions: EmbeddedRegion[] = []
		let scanner = this.languageService.createScanner(document.getText())
		let lastAttributeName: string | null = null
		let token = scanner.scan()

		while (token !== TokenType.EOS) {
			switch (token) {
				// Ignore `<style>` tag.
				case TokenType.StartTag:
					lastAttributeName = null
					break

				case TokenType.Styles:
					regions.push({
						languageId: 'css',
						start: scanner.getTokenOffset(),
						end: scanner.getTokenEnd(),
					})
					break

				case TokenType.Script:
					regions.push({
						languageId: 'javascript',
						start: scanner.getTokenOffset(),
						end: scanner.getTokenEnd(),
					})
					break

				case TokenType.AttributeName:
					lastAttributeName = scanner.getTokenText()
					break

				case TokenType.AttributeValue:
					// Only check embedded `style="..."`, ignore `onclick=""...""`
					let attributeLanguageId = this.getAttributeLanguage(lastAttributeName)
					if (attributeLanguageId) {
						let start = scanner.getTokenOffset()
						let end = scanner.getTokenEnd()
						let firstChar = document.getText()[start]
						
						if (firstChar === '\'' || firstChar === '"') {
							start++
							end--
						}

						regions.push({
							languageId: attributeLanguageId,
							start,
							end,
						})
					}

					lastAttributeName = null
					break
			}

			token = scanner.scan()
		}

		return new HTMLEmbeddedRegions(document, regions)
	}

	private getAttributeLanguage(attributeName: string | null): string | null {
		if (attributeName === 'style') {
			return 'css'
		}

		return null
	}
}


export class HTMLEmbeddedRegions {

	/** As default css selector name for anolymous styles like inner style. */
	CSS_INNER_STYLE_PROPERTY = '__'

	constructor(
		private document: TextDocument,
		private regions: EmbeddedRegion[],
	) {}
	
	/** Get language from position, may return `css`, `javascript` or `html`. */
	getLanguageAtPosition(position: Position): string | undefined {
		let offset = this.document.offsetAt(position)

		for (let region of this.regions) {
			if (region.start <= offset) {
				if (offset <= region.end) {
					return region.languageId
				}
			}
			else {
				break
			}
		}

		return 'html'
	}
	
	/** Can used to get css embedded document from a html`...`, will fill empty chars for non css part. */
	getEmbeddedDocumentContent(languageId: string) {
		let content = this.document.getText()
		let result = ''
		let lastSuffix = ''
		let lastIndex = 0
		
		for (let region of this.regions) {
			if (region.languageId === languageId) {
				result += this.substituteWithWhitespace(
					content,
					lastIndex,
					region.start,
					lastSuffix,
					this.getPrefix(region),
				)

				result += content.slice(region.start, region.end)
				lastIndex = region.end
				lastSuffix = this.getSuffix(region)
			}
		}

		result += this.substituteWithWhitespace(
			content,
			lastIndex,
			content.length,
			lastSuffix,
			'',
		)

		return result
	}

	/** Not the best way, but simple. */
	private substituteWithWhitespace(
		content: string,
		start: number,
		end: number,
		before: string,
		after: string
	) {
        let result = before
        let leftCharCount = 0
        
        // Must keep line index!
		for (let i = start; i < end; i++) {
			let ch = content[i]
			if (ch === '\n' || ch === '\r') {
				result += ch
				leftCharCount = 0
			}
			else {
				leftCharCount++
			}
        }
        
		result += ' '.repeat(leftCharCount - after.length)
        result += after
        
		return result
    }
    
	private getPrefix(region: EmbeddedRegion) {
        switch (region.languageId) {
            case 'css':
                return this.CSS_INNER_STYLE_PROPERTY + '{'
        }

		return ''
	}

	private getSuffix(c: EmbeddedRegion) {
        switch (c.languageId) {
            case 'css':
                return '}'
        }

		return ''
	}
}


