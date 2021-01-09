import {getSCSSLanguageService, getCSSLanguageService, LanguageService as CSSLanguageService} from 'vscode-css-languageservice'


export function getFlitCSSLanguageService(): CSSLanguageService {
	let scssService = Object.assign({}, getSCSSLanguageService())
	let cssService = getCSSLanguageService()

	/** Using normal css completion service. */
	scssService.doComplete = cssService.doComplete

	return scssService
}