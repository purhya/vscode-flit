import TemplateContext from './template-context'


/** Provide more language service for document embedded in a template string inside a TypeScript file. */
export default interface TemplateLanguageService {

	getCompletionsAtPosition?(
		context: TemplateContext,
		position: ts.LineAndCharacter,
		options?: ts.GetCompletionsAtPositionOptions
	): ts.CompletionInfo | undefined

	getCompletionEntryDetails?(
		context: TemplateContext,
		position: ts.LineAndCharacter,
		name: string,
		options?: ts.FormatCodeOptions | ts.FormatCodeSettings
	): ts.CompletionEntryDetails | undefined

	getQuickInfoAtPosition?(
		context: TemplateContext,
		position: ts.LineAndCharacter
	): ts.QuickInfo | undefined

	/** Returned definition should be fit with global document. */
	getGlobalDefinitionAtPosition?(
		context: TemplateContext,
		position: ts.LineAndCharacter
	): ts.DefinitionInfo[]
	
	/** Returned definition should be fit with global document. */
	getGlobalDefinitionAndBoundSpan?(
		context: TemplateContext,
		position: ts.LineAndCharacter
	): ts.DefinitionInfoAndBoundSpan | undefined

	getSyntacticDiagnostics?(
		context: TemplateContext
	): ts.Diagnostic[]

	getSemanticDiagnostics?(
		context: TemplateContext
	): ts.Diagnostic[]

	getFormattingEditsForRange?(
		context: TemplateContext,
		start: number,
		end: number,
		settings: ts.EditorSettings
	): ts.TextChange[]

	getSupportedCodeFixes?(): number[]

	getCodeFixesAtPosition?(
		context: TemplateContext,
		start: number,
		end: number,
		errorCodes: ReadonlyArray<number>,
		formatOptions: ts.FormatCodeSettings,
		preferences: ts.UserPreferences
	): Array<ts.CodeFixAction>

	getSignatureHelpItemsAtPosition?(
		context: TemplateContext,
		position: ts.LineAndCharacter,
		options?: ts.SignatureHelpItemsOptions
	): ts.SignatureHelpItems | undefined

	getOutliningSpans?(
		context: TemplateContext
	): ts.OutliningSpan[]

	getGlobalReferencesAtPosition?(
		context: TemplateContext,
		position: ts.LineAndCharacter
	): ts.ReferencedSymbol[] | undefined

	getJsxClosingTagAtPosition?(
		context: TemplateContext,
		position: ts.LineAndCharacter
	): ts.JsxClosingTagInfo | undefined
}
