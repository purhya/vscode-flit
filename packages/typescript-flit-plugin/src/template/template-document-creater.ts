import {TemplateContext} from 'typescript-template-language-service-decorator'
import * as vscode from 'vscode-languageserver-types'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLEmbeddedRegions} from './html-embedded-region-parser'


export namespace TemplateDocumentCreater {

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


	function createDocument(context: TemplateContext, text: string, languageId: string) {
		let lineCount = getLineCount(text)

		return {
			uri: `untitled://embedded.${languageId}`,
			languageId: languageId,
			version: 1,
			getText: () => text,
			positionAt: (offset: number) => {
				return context.toPosition(offset)
			},
			offsetAt: (p: vscode.Position) => {
				return context.toOffset(p)
			},
			lineCount,
		} as TextDocument
	}

	function getLineCount(text: string) {
		let lineCount = 0

		for (let char of text) {
			if (char === '\n') {
				lineCount++
			}
		}

		return lineCount
	}
}
