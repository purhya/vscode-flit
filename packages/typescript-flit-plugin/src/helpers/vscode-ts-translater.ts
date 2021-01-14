import * as ts from 'typescript/lib/tsserverlibrary'
import {FoldingRange} from 'vscode-html-languageservice'
import * as vscode from 'vscode-languageserver-types'
import {config} from '../config'
import {TemplateContext} from '../template-decorator'


/** Reference to https://github.com/microsoft/typescript-styled-plugin/blob/master/src/_language-service.ts */
export class VSCodeTSTranslater {

	constructor(
		private readonly typescript: typeof ts
	) {}

	private translateDiagnostic(diagnostic: vscode.Diagnostic, file: ts.SourceFile, context: TemplateContext): ts.Diagnostic | undefined {
		// Make sure returned error is within the real document.
		if (diagnostic.range.start.line === 0
			|| diagnostic.range.start.line > context.document.lineCount
			|| diagnostic.range.start.character >= context.document.getText().length
		) {
			return undefined
		}

		let start = context.localOffsetAt(diagnostic.range.start)
		let length = context.localOffsetAt(diagnostic.range.end) - start
		let code = typeof diagnostic.code === 'number' ? diagnostic.code : 9999
		
		return {
			code,
			messageText: diagnostic.message,
			category: this.translateSeverity(this.typescript, diagnostic.severity),
			file,
			start,
			length,
			source: config.pluginName,
		}
	}
	
	private translateSeverity(typescript: typeof ts, severity: vscode.DiagnosticSeverity | undefined): ts.DiagnosticCategory {
		switch (severity) {
			case vscode.DiagnosticSeverity.Information:
			case vscode.DiagnosticSeverity.Hint:
				return typescript.DiagnosticCategory.Message
	
			case vscode.DiagnosticSeverity.Warning:
				return typescript.DiagnosticCategory.Warning
	
			case vscode.DiagnosticSeverity.Error:
			default:
				return typescript.DiagnosticCategory.Error
		}
	}

	translateHover(hover: vscode.Hover, position: ts.LineAndCharacter, context: TemplateContext): ts.QuickInfo {
		let header: ts.SymbolDisplayPart[] = []
		let documentation: ts.SymbolDisplayPart[] = []

		let convertPart = (hoverContents: typeof hover.contents) => {
			if (typeof hoverContents === 'string') {
				documentation.push({kind: 'unknown', text: hoverContents})
			}
			else if (Array.isArray(hoverContents)) {
				hoverContents.forEach(convertPart)
			}
			else {
				header.push({kind: 'unknown', text: hoverContents.value})
			}
		}

		convertPart(hover.contents)

		let start = context.localOffsetAt(hover.range ? hover.range.start : position)

		return {
			kind: this.typescript.ScriptElementKind.string,
			kindModifiers: '',
			textSpan: {
				start,
				length: hover.range ? context.localOffsetAt(hover.range.end) - start : 1,
			},
			displayParts: header,
			documentation,
			tags: [],
		}
	}

	translateCodeFixActions(codeActions: vscode.Command[], context: TemplateContext): ts.CodeFixAction[] {
		let actions: ts.CodeFixAction[] = []

		for (let vsAction of codeActions) {
			if (vsAction.command !== '_css.applyCodeAction') {
				continue
			}

			let edits = vsAction.arguments && vsAction.arguments[2] as vscode.TextEdit[]
			if (edits) {
				actions.push({
					fixName: '',
					description: vsAction.title,
					changes: edits.map(edit => this.translateTextEditToFileTextChange(context, edit)),
				})
			}
		}

		return actions
	}

	private translateTextEditToFileTextChange(context: TemplateContext, textEdit: vscode.TextEdit): ts.FileTextChanges {
		let start = context.localOffsetAt(textEdit.range.start)
		let end = context.localOffsetAt(textEdit.range.end)

		return {
			fileName: context.fileName,
			textChanges: [{
				newText: textEdit.newText,
				span: {
					start,
					length: end - start,
				},
			}],
		}
	}

	translateOutliningSpan(range: FoldingRange, context: TemplateContext): ts.OutliningSpan {
		let startOffset = context.localOffsetAt({line: range.startLine, character: range.startCharacter || 0})
		let endOffset = context.localOffsetAt({line: range.endLine, character: range.endCharacter || 0})
		
		let span = {
			start: startOffset,
			length: endOffset - startOffset,
		}

		return {
			autoCollapse: false,
			kind: this.typescript.OutliningSpanKind.Code,
			bannerText: '',
			textSpan: span,
			hintSpan: span,
		}
	}
		
	translateCompletion(items: vscode.CompletionList, context: TemplateContext): ts.CompletionInfo {
		return {
			isGlobalCompletion: false,
			isMemberCompletion: false,
			isNewIdentifierLocation: false,
			entries: items.items.map(x => this.translateCompetionEntry(x, context)),
		}
	}

	getEmptyCompletion(): ts.CompletionInfo {
		return {
			isGlobalCompletion: false,
			isMemberCompletion: false,
			isNewIdentifierLocation: false,
			entries: [],
		}
	}

	private translateCompetionEntry(vsItem: vscode.CompletionItem, context: TemplateContext): ts.CompletionEntry {
		let kind = vsItem.kind ? this.translateionCompletionItemKind(vsItem.kind) : this.typescript.ScriptElementKind.unknown
		let name = this.removeSnippet(vsItem.label)

		let entry: ts.CompletionEntry = {
			name: this.removeSnippet(vsItem.label),
			kind,
			sortText: name,
		}

		if (vsItem.textEdit) {
			entry.insertText = this.removeSnippet(vsItem.textEdit.newText)

			if (vsItem.textEdit.hasOwnProperty('range')) {
				entry.replacementSpan = this.toTsSpan((vsItem.textEdit as vscode.TextEdit).range, context)
			}
			else {
				entry.replacementSpan = this.toTsSpan((vsItem.textEdit as vscode.InsertReplaceEdit).replace, context)
			}
		}

		return entry
	}

	/** vscode snippet syntax `$1` not been supported in typescript. */
	private removeSnippet(label: string) {
		return label.replace(/\$\d/, '')
	}

	translateCompletionToEntryDetails(item: vscode.CompletionItem): ts.CompletionEntryDetails {
		return {
			name: item.label,
			kindModifiers: 'declare',
			kind: item.kind ? this.translateionCompletionItemKind(item.kind) : this.typescript.ScriptElementKind.unknown,
			displayParts: this.toDisplayParts(item.detail),
			documentation: this.toDisplayParts(item.documentation),
			tags: [],
		} 
	}

	toDisplayParts(text: string | vscode.MarkupContent | undefined): ts.SymbolDisplayPart[] {
		if (!text) {
			return []
		}

		return [{
			kind: 'text',
			text: typeof text === 'string' ? text : text.value,
		}]
	}

	private translateionCompletionItemKind(kind: vscode.CompletionItemKind): ts.ScriptElementKind {
		switch (kind) {
			case vscode.CompletionItemKind.Method:
				return this.typescript.ScriptElementKind.memberFunctionElement

			case vscode.CompletionItemKind.Function:
				return this.typescript.ScriptElementKind.functionElement

			case vscode.CompletionItemKind.Constructor:
				return this.typescript.ScriptElementKind.constructorImplementationElement

			case vscode.CompletionItemKind.Field:
			case vscode.CompletionItemKind.Variable:
				return this.typescript.ScriptElementKind.variableElement

			case vscode.CompletionItemKind.Class:
				return this.typescript.ScriptElementKind.classElement

			case vscode.CompletionItemKind.Interface:
				return this.typescript.ScriptElementKind.interfaceElement

			case vscode.CompletionItemKind.Module:
				return this.typescript.ScriptElementKind.moduleElement

			case vscode.CompletionItemKind.Property:
				return this.typescript.ScriptElementKind.memberVariableElement

			case vscode.CompletionItemKind.Unit:
			case vscode.CompletionItemKind.Value:
				return this.typescript.ScriptElementKind.constElement

			case vscode.CompletionItemKind.Enum:
				return this.typescript.ScriptElementKind.enumElement

			case vscode.CompletionItemKind.Keyword:
				return this.typescript.ScriptElementKind.keyword

			case vscode.CompletionItemKind.Color:
				return this.typescript.ScriptElementKind.constElement

			case vscode.CompletionItemKind.Reference:
				return this.typescript.ScriptElementKind.alias

			case vscode.CompletionItemKind.File:
				return this.typescript.ScriptElementKind.moduleElement

			case vscode.CompletionItemKind.Snippet:
			case vscode.CompletionItemKind.Text:
			default:
				return this.typescript.ScriptElementKind.unknown
		}
	}

	toTsSpan(range: vscode.Range, context: TemplateContext): ts.TextSpan {
		let editStart = context.localOffsetAt(range.start)
		let editEnd = context.localOffsetAt(range.end)

		return {
			start: editStart,
			length: editEnd - editStart,
		}
	}

	translateDiagnostics(diagnostics: vscode.Diagnostic[], context: TemplateContext ): ts.Diagnostic[] {
		let sourceFile = context.node.getSourceFile()
		return diagnostics.map(diag => this.translateDiagnostic(diag, sourceFile, context)).filter(v => v) as ts.Diagnostic[]
	}

	
	toVsRange(context: TemplateContext, start: number, end: number): vscode.Range {
		return {
			start: context.localPositionAt(start),
			end: context.localPositionAt(end),
		}
	}

	isVSRangeOverlaps(a: vscode.Range, b: vscode.Range): boolean {
		return !this.isVSPositionAfter(a.end, b.start) && !this.isVSPositionAfter(b.end, a.start)
	}

	private isVSPositionAfter(left: vscode.Position, right: vscode.Position): boolean {
		return right.line > left.line || (right.line === left.line && right.character >= left.character)
	}

	translateTSCompletionEntryToEntryDetails(entry: ts.CompletionEntry): ts.CompletionEntryDetails {
		return {
			name: entry.name,
			kindModifiers: entry.kindModifiers || 'declare',
			kind: entry.kind,
			displayParts: [],
			documentation: [],
			tags: [],
		}
	}

	translateHighlightsToGlobalReferenceSymbol(highlights: vscode.DocumentHighlight[], position: vscode.Position, context: TemplateContext): ts.ReferencedSymbol[] {
		let references: ts.ReferenceEntry[] = highlights.map(highlight => {
			let textSpan = this.toTsSpan(highlight.range, context)
			textSpan.start = context.toGlobalOffset(textSpan.start)

			return {
				isWriteAccess: false,
        		isDefinition: false,
				fileName: context.fileName,
				textSpan,
			}
		})

		let definitionSpan: ts.TextSpan = {
			start: context.toGlobalOffset(context.localOffsetAt(position)),
			length: 0,
		}

		return [{
			definition: {
				containerKind: this.typescript.ScriptElementKind.string,
				containerName: '',
				displayParts: [],
				fileName: context.fileName,
				kind: this.typescript.ScriptElementKind.string,
				name: '',
				textSpan: definitionSpan,
			},
			references,
		}]
	}
}