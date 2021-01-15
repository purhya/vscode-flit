import * as ts from 'typescript/lib/tsserverlibrary'
import {TextDocument} from 'vscode-languageserver-textdocument'
import ScriptSourceHelper from './helpers/script-source-helper'
import TemplateSettings from './template-settings'


/** If source file not changed, TemplateContext will keep same for same template. */
export default class TemplateContext {

	/** Raw contents of the template string, still has substitutions in place. */
	rawText: string

	/** Contents of the template string, Has substitutions replaced already. */
	text: string

	/** Embedded document for template string. */
	document: TextDocument

	constructor(
		/** Name of the file the template is in. */
		readonly fileName: string,

		/** Template literal node. */
		readonly node: ts.TemplateLiteral,

		/** Template tag name. */
		readonly tagName: string,

		private readonly templateSettings: TemplateSettings,
		private readonly helper: ScriptSourceHelper,
		private readonly typescript: typeof ts
	) {
		this.rawText = this.node.getFullText().slice(1, -1)
		this.text = PlaceholderSubstitutionHelper.replacePlaceholders(node, this.rawText, templateSettings, this.typescript)
		this.document = TextDocument.create(`untitled://embedded.${this.tagName}`, this.tagName, 1, this.text)
	}
	
	/** Offset of the start template position in original document. */
	private get bodyOffset(): number {
		return this.node.pos + 1
	}

	/** Line and character of the start template position in original document. */
	private get bodyPosition(): ts.LineAndCharacter {
		return this.helper.getPosition(this.fileName, this.bodyOffset)
	}

	update() {
		let newRawText = this.node.getFullText().slice(1, -1)
		if (newRawText !== this.rawText) {
			this.rawText = newRawText
			this.text = PlaceholderSubstitutionHelper.replacePlaceholders(this.node, this.rawText, this.templateSettings, this.typescript)
			this.document = TextDocument.create(`untitled://embedded.${this.tagName}`, this.tagName, 1, this.text)
		}
	}

	/** Convert line and character location to an offset within the template document. */
	localOffsetAt(localPosition: ts.LineAndCharacter): number {
		return this.document.offsetAt(localPosition)
	}

	/** Convert offset to line and character location within the template document. */
	localPositionAt(localOffset: number): ts.LineAndCharacter {
		return this.document.positionAt(localOffset)
	}

	/** Convert global offset to local offset. */
	toLocalOffset(globalOffset: number): number {
		return Math.max(0, globalOffset - this.bodyOffset)
	}

	/** Convert local offset to global offset. */
	toGlobalOffset(localOffset: number): number {
		return localOffset + this.bodyOffset
	}

	/** Convert global location to local location. */
	toLocalPosition(globalPosition: ts.LineAndCharacter): ts.LineAndCharacter {
		return {
			line: globalPosition.line - this.bodyPosition.line,
			character: globalPosition.line === this.bodyPosition.line ? globalPosition.character - this.bodyPosition.character : globalPosition.character,
		}
	}

	/** Convert global location to local location. */
	toGlobalPosition(localPosition: ts.LineAndCharacter): ts.LineAndCharacter {
		return {
			line: localPosition.line + this.bodyPosition.line,
			character: localPosition.line === 0 ? localPosition.character + this.bodyPosition.character : localPosition.character,
		}
	}

	/** Convert global offset to local location. */
	globalOffsetToLocalPosition(globalOffset: number) {
		let localOffset = this.toLocalOffset(globalOffset)
		return this.localPositionAt(localOffset)
	}

	/** Check whether a global offset inside current template range. */
	isCrossWithGlobalRange(start: number, end: number) {
		return !(end < this.bodyOffset || start > this.bodyOffset + this.rawText.length)
	}
}



namespace PlaceholderSubstitutionHelper {

	export function replacePlaceholders(node: ts.TemplateLiteral, templateString: string, settings: TemplateSettings, typescript: typeof ts): string {
		if (node.kind === typescript.SyntaxKind.NoSubstitutionTemplateLiteral) {
			return templateString
		}

		return getSubstitutions(
			node,
			templateString,
			settings
		)
	}

	function getSubstitutions(node: ts.TemplateExpression, templateString: string, settings: TemplateSettings): string {
		let spans = getPlaceholderSpans(node)

		if (settings.getSubstitutions) {
			return settings.getSubstitutions(templateString, spans)
		}

		let result = ''
		let lastIndex = 0

		for (let span of spans) {
			result += templateString.slice(lastIndex, span.start)
			result += getSubstitution(templateString, span.start, span.end, settings)
			lastIndex = span.end
		}

		result += templateString.slice(lastIndex)

		return result
	}

	function getPlaceholderSpans(node: ts.TemplateExpression) {
		let spans: {start: number, end: number}[] = []
		let templateStart = node.getStart() + 1
		let spanStart = node.head.end - templateStart - 2

		// `start${ span }literal...`
		// Each span location includes `${}`.
		for (let {literal} of node.templateSpans) {
			let spanEnd = literal.getStart() - templateStart + 1
			spans.push({start: spanStart, end: spanEnd})
			spanStart = literal.getEnd() - templateStart - 2
		}

		return spans
	}

	function getSubstitution(templateString: string, start: number, end: number, settings: TemplateSettings): string {
		return settings.getSubstitution
			? settings.getSubstitution(templateString, start, end)
			: 'x'.repeat(end - start)
	}
}
