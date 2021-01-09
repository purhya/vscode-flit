import {TemplateContext} from 'typescript-template-language-service-decorator'
import * as ts from 'typescript/lib/tsserverlibrary'
import {FoldingRange} from 'vscode-html-languageservice'
import {TextDocument} from 'vscode-languageserver-textdocument'
import * as vscode from 'vscode-languageserver-types'
import {config} from '../config'


/** Reference to https://github.com/microsoft/typescript-styled-plugin/blob/master/src/_language-service.ts */
export class VSCodeToTSTranslater {

	constructor(
		private readonly typescript: typeof ts
	) {}

	private translateDiagnostic(diagnostic: vscode.Diagnostic, file: ts.SourceFile, document: TextDocument, context: TemplateContext): ts.Diagnostic | undefined {
		// Make sure returned error is within the real document.
		if (diagnostic.range.start.line === 0
			|| diagnostic.range.start.line > document.lineCount
			|| diagnostic.range.start.character >= document.getText().length
		) {
			return undefined
		}

		let start = context.toOffset(diagnostic.range.start)
		let length = context.toOffset(diagnostic.range.end) - start
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
		let docs: ts.SymbolDisplayPart[] = []

		let convertPart = (hoverContents: typeof hover.contents) => {
			if (typeof hoverContents === 'string') {
				docs.push({kind: 'unknown', text: hoverContents})
			}
			else if (Array.isArray(hoverContents)) {
				hoverContents.forEach(convertPart)
			}
			else {
				header.push({kind: 'unknown', text: hoverContents.value})
			}
		}

		convertPart(hover.contents)

		let start = context.toOffset(hover.range ? hover.range.start : position)

		return {
			kind: this.typescript.ScriptElementKind.string,
			kindModifiers: '',
			textSpan: {
				start,
				length: hover.range ? context.toOffset(hover.range.end) - start : 1,
			},
			displayParts: header,
			documentation: docs,
			tags: [],
		}
	}

	translateCodeActions(codeActions: vscode.Command[], context: TemplateContext): ts.CodeAction[] {
		let actions: ts.CodeAction[] = []

		for (let vsAction of codeActions) {
			if (vsAction.command !== '_css.applyCodeAction') {
				continue
			}

			let edits = vsAction.arguments && vsAction.arguments[2] as vscode.TextEdit[]
			if (edits) {
				actions.push({
					description: vsAction.title,
					changes: edits.map(edit => this.translateTextEditToFileTextChange(context, edit)),
				})
			}
		}

		return actions
	}

	private translateTextEditToFileTextChange(context: TemplateContext, textEdit: vscode.TextEdit): ts.FileTextChanges {
		let start = context.toOffset(textEdit.range.start)
		let end = context.toOffset(textEdit.range.end)

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
		let startOffset = context.toOffset({line: range.startLine, character: range.startCharacter || 0})
		let endOffset = context.toOffset({line: range.endLine, character: range.endCharacter || 0})
		
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

	private translateCompetionEntry(vsItem: vscode.CompletionItem, context: TemplateContext): ts.CompletionEntry {
		let kind = vsItem.kind ? this.translateionCompletionItemKind(vsItem.kind) : this.typescript.ScriptElementKind.unknown

		let entry: ts.CompletionEntry = {
			name: vsItem.label,
			kind,
			sortText: '0',
		}

		if (vsItem.textEdit) {
			entry.insertText = vsItem.textEdit.newText

			if (vsItem.textEdit.hasOwnProperty('range')) {
				entry.replacementSpan = this.toTsSpan((vsItem.textEdit as vscode.TextEdit).range, context)
			}
			else {
				entry.replacementSpan = this.toTsSpan((vsItem.textEdit as vscode.InsertReplaceEdit).replace, context)
			}
		}

		return entry
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

	private toDisplayParts(text: string | vscode.MarkupContent | undefined): ts.SymbolDisplayPart[] {
		if (!text) {
			return []
		}

		return [{
			kind: 'text',
			text: typeof text === 'string' ? text : text.value,
		}]
	}

	toTsSpan(range: vscode.Range, context: TemplateContext): ts.TextSpan {
		let editStart = context.toOffset(range.start)
		let editEnd = context.toOffset(range.end)

		return {
			start: editStart,
			length: editEnd - editStart,
		}
	}

	translateDiagnostics(diagnostics: vscode.Diagnostic[], document: TextDocument, context: TemplateContext ): ts.Diagnostic[] {
		let sourceFile = context.node.getSourceFile()
		return diagnostics.map(diag => this.translateDiagnostic(diag, sourceFile, document, context)).filter(v => v) as ts.Diagnostic[]
	}

}