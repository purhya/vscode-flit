import {getSCSSLanguageService, getCSSLanguageService, LanguageService as CSSLanguageService} from 'vscode-css-languageservice'


/** Uses all scss language service except css completion. */
export function getFlitCSSLanguageService(): CSSLanguageService {
	let scssService = {...getSCSSLanguageService()}
	let cssService = getCSSLanguageService()

	/** Using normal css completion service. */
	scssService.doComplete = cssService.doComplete

	return scssService
}