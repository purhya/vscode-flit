import * as ts from 'typescript/lib/tsserverlibrary'
import TemplateLanguageService from './template-language-service'
import TemplateContext from './template-context'
import TemplateContextProvider from './template-context-provider'


// from `(A, B) => C`
// to `(D: () => C, A, B) => C`
type LanguageServiceWrapper<K extends keyof ts.LanguageService>
	= ts.LanguageService[K] extends (...args: infer A) => infer R
		? (callOriginal: () => R, ...args: A) => R
		: never

// Get value of object.
type ValueOf<O> = O[keyof O]


export default class TemplateLanguageServiceProxy {

	private readonly wrappers: {name: keyof ts.LanguageService, wrapper: LanguageServiceWrapper<any>}[] = []

	constructor(
		private readonly typescript: typeof ts,
		private readonly provider: TemplateContextProvider,
		private readonly service: TemplateLanguageService
	) {
		this.wrapGetCompletionsAtPosition()
		this.wrapGetCompletionEntryDetails()
		this.wrapGetQuickInfoAtPosition()
		this.wrapGetDefinitionAtPosition()
		this.wrapGetDefinitionAndBoundSpan()
		this.wrapGetSemanticDiagnostics()
		this.wrapGetSyntacticDiagnostics()
		this.wrapGetFormattingEditsForRange()
		this.wrapGetCodeFixesAtPosition()
		this.wrapGetSupportedCodeFixes()
		this.wrapGetSignatureHelpItemsAtPosition()
		this.wrapGetOutliningSpans()
		this.wrapGetReferencesAtPosition()
		this.wrapGetJsxClosingTagAtPosition()
	}

	/** Desorate with low level typescript language service. */
	decorate(rawLanguageService: ts.LanguageService) {
		let wrappedService: Map<keyof ts.LanguageService, ValueOf<ts.LanguageService>> = new Map()

		for (let {name, wrapper} of this.wrappers) {
			wrappedService.set(name, (...args: any[]) => {
				let rawServiceFn = (rawLanguageService as any)[name]
				let callOriginal = () => rawServiceFn(...args)

				return wrapper(callOriginal, ...args)
			})
		}

		return new Proxy(rawLanguageService, {
			get: (target: any, property: keyof ts.LanguageService) => {
				return wrappedService.get(property) || target[property]
			},
		})
	}

	/** Wrap with a interpolated service function. */
	private wrap<K extends keyof ts.LanguageService>(name: K, wrapper: LanguageServiceWrapper<K>) {
		this.wrappers.push({
			name,
			wrapper
		})
	}

	private wrapGetCompletionsAtPosition() {
		if (!this.service.getCompletionsAtPosition) {
			return
		}

		this.wrap('getCompletionsAtPosition', (callOriginal, fileName: string, offset: number, options) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}

			let localPosition = context.globalOffsetToLocalPosition(offset)
			let info = this.service.getCompletionsAtPosition!(context, localPosition, options)

			if (info) {
				info.entries.forEach(entry => this.translateTextSpan(entry.replacementSpan, context!))
			}

			return info
		})
	}

	private translateTextSpan(textSpan: ts.TextSpan | undefined, context: TemplateContext) {
		if (textSpan) {
			textSpan.start = context.toGlobalOffset(textSpan.start)
		}
	}

	private wrapGetCompletionEntryDetails() {
		if (!this.service.getCompletionEntryDetails) {
			return
		}

		this.wrap('getCompletionEntryDetails', (callOriginal, fileName: string, offset: number, name: string, options) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}

			let localPosition = context.globalOffsetToLocalPosition(offset)
			let entry = this.service.getCompletionEntryDetails!(context, localPosition, name, options)

			return entry
		})
	}

	private wrapGetQuickInfoAtPosition() {
		if (!this.service.getQuickInfoAtPosition) {
			return
		}

		this.wrap('getQuickInfoAtPosition', (callOriginal, fileName: string, offset: number) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}
			let localPosition = context.globalOffsetToLocalPosition(offset)
			let info = this.service.getQuickInfoAtPosition!(context, localPosition)

			if (info) {
				this.translateTextSpan(info.textSpan, context)
			}

			return info
		})
	}

	private wrapGetDefinitionAtPosition() {
		if (!this.service.getGlobalDefinitionAtPosition) {
			return
		}

		this.wrap('getDefinitionAtPosition', (callOriginal, fileName: string, offset: number) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}

			let localPosition = context.globalOffsetToLocalPosition(offset)
			let definitions = this.service.getGlobalDefinitionAtPosition!(context, localPosition)


			return definitions
		})
	}

	private wrapGetDefinitionAndBoundSpan() {
		if (!this.service.getGlobalDefinitionAndBoundSpan) {
			return
		}
		
		this.wrap('getDefinitionAndBoundSpan', (callOriginal, fileName: string, offset: number) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}

			let localPosition = context.globalOffsetToLocalPosition(offset)
			let definitionAndSpan = this.service.getGlobalDefinitionAndBoundSpan!(context, localPosition)

			return definitionAndSpan
		})
	}

	private wrapGetSyntacticDiagnostics() {
		if (!this.service.getSyntacticDiagnostics) {
			return
		}

		this.wrap('getSyntacticDiagnostics', (callOriginal, fileName: string) => {
			let diagnostics: ts.Diagnostic[] = []

			for (let context of this.provider.getAllTemplateContexts(fileName)) {
				let subDiagnostics = this.service.getSyntacticDiagnostics!(context)

				subDiagnostics.forEach(diagnostic => {
					diagnostic.start = context.toGlobalOffset(diagnostic.start!)
				})

				diagnostics.push(...diagnostics)
			}

			return [...callOriginal(), ...diagnostics] as ts.DiagnosticWithLocation[]
		})
	}

	private wrapGetSemanticDiagnostics() {
		if (!this.service.getSemanticDiagnostics) {
			return
		}

		this.wrap('getSemanticDiagnostics', (callOriginal, fileName: string) => {
			let diagnostics: ts.Diagnostic[] = []

			for (let context of this.provider.getAllTemplateContexts(fileName)) {
				let subDiagnostics = this.service.getSemanticDiagnostics!(context)

				subDiagnostics.forEach(diagnostic => {
					diagnostic.start = context.toGlobalOffset(diagnostic.start!)
				})

				diagnostics.push(...subDiagnostics)
			}

			return [...callOriginal(), ...diagnostics]
		})
	}

	private wrapGetFormattingEditsForRange() {
		if (!this.service.getFormattingEditsForRange) {
			return
		}

		this.wrap('getFormattingEditsForRange', (callOriginal, fileName: string, start: number, end: number, options: ts.FormatCodeSettings) => {
			let changes: ts.TextChange[] = []

			for (let context of this.provider.getAllTemplateContexts(fileName)) {
				if (!context.isCrossWithGlobalRange(start, end)) {
					continue
				}

				let templateStart = context.toLocalOffset(start)
				let templateEnd = context.toLocalOffset(end)
				
				for (let change of this.service.getFormattingEditsForRange!(context, templateStart, templateEnd, options)) {
					this.translateTextSpan(change.span, context)
					changes.push(change)
				}
			}

			return [
				...callOriginal(),
				...changes,
			]
		})
	}

	private wrapGetCodeFixesAtPosition() {
		if (!this.service.getCodeFixesAtPosition) {
			return
		}

		this.wrap('getCodeFixesAtPosition', (callOriginal, fileName: string, start: number, end: number, errorCodes: ReadonlyArray<number>, options: ts.FormatCodeSettings, preferences: ts.UserPreferences) => {
			let actions: ts.CodeFixAction[] = []

			for (let context of this.provider.getAllTemplateContexts(fileName)) {
				if (!context.isCrossWithGlobalRange(start, end)) {
					continue
				}

				let templateStart = context.toLocalOffset(start)
				let templateEnd = context.toLocalOffset(end)

				for (let action of this.service.getCodeFixesAtPosition!(context, templateStart, templateEnd, errorCodes, options, preferences)) {
					action.changes.forEach(change => {
						change.textChanges.forEach(change => {
							this.translateTextSpan(change.span, context)
						})
					})

					actions.push(action)
				}
			}

			return [
				...callOriginal(),
				...actions,
			]
		})
	}

	private wrapGetSupportedCodeFixes() {
		if (!this.service.getSupportedCodeFixes) {
			return
		}

		let callOriginal = this.typescript.getSupportedCodeFixes.bind(this.typescript)

		this.typescript.getSupportedCodeFixes = () => {
			return [
				...callOriginal(),
				...this.service.getSupportedCodeFixes!().map(x => String(x)),
			]
		}
	}

	private wrapGetSignatureHelpItemsAtPosition() {
		if (!this.service.getSignatureHelpItemsAtPosition) {
			return
		}

		this.wrap('getSignatureHelpItems', (callOriginal, fileName: string, offset: number, options?: ts.SignatureHelpItemsOptions) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}

			let localPosition = context.globalOffsetToLocalPosition(offset)
			let items = this.service.getSignatureHelpItemsAtPosition!(context, localPosition, options)

			if (items) {
				this.translateTextSpan(items.applicableSpan, context)
			}

			return items
		})
	}

	private wrapGetOutliningSpans() {
		if (!this.service.getOutliningSpans) {
			return
		}

		this.wrap('getOutliningSpans', (callOriginal, fileName: string) => {
			let spans: ts.OutliningSpan[] = []

			for (let context of this.provider.getAllTemplateContexts(fileName)) {
				for (let outliningSpan of this.service.getOutliningSpans!(context)) {
					this.translateTextSpan(outliningSpan.textSpan, context)
					this.translateTextSpan(outliningSpan.hintSpan, context)

					spans.push(outliningSpan)
				}
			}

			return [
				...callOriginal(),
				...spans,
			]
		})
	}

	private wrapGetReferencesAtPosition() {
		if (!this.service.getGlobalReferencesAtPosition) {
			return
		}

		this.wrap('findReferences', (callOriginal, fileName: string, offset: number) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}

			let localPosition = context.globalOffsetToLocalPosition(offset)
			let symbols = this.service.getGlobalReferencesAtPosition!(context, localPosition)

			if (symbols) {
				symbols.forEach(symbol => {
					this.translateTextSpan(symbol.definition.textSpan, context!)
				})
			}

			return symbols
		})
	}

	private wrapGetJsxClosingTagAtPosition() {
		if (!this.service.getJsxClosingTagAtPosition) {
			return
		}

		this.wrap('getJsxClosingTagAtPosition', (callOriginal, fileName: string, offset: number) => {
			let context = this.provider.getTemplateContextAtOffset(fileName, offset)
			if (!context) {
				return callOriginal()
			}

			let localPosition = context.globalOffsetToLocalPosition(offset)
			let info = this.service.getJsxClosingTagAtPosition!(context, localPosition)

			return info
		})
	}
}
