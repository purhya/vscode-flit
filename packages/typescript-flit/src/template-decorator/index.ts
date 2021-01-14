import * as ts from 'typescript/lib/tsserverlibrary'
import TemplateLanguageService from './template-language-service'
import TemplateSettings from './template-settings'
import TemplateLanguageServiceDecorator from './template-language-service-decorator'
import TemplateContext from './template-context'
import TemplateContextProvider from './template-context-provider'


// Fork from https://github.com/microsoft/typescript-template-language-service-decorator
// Nearly changed all codes.


export {
	TemplateLanguageService,
	TemplateSettings,
	TemplateContext,
}


/**
 * Augments a TypeScript language service with language support for the contents of template strings.
 *
 * @param typescript Instance of typescript to use.
 * @param languageService Base language service to augment.
 * @param templateService Language service for contents of template strings.
 * @param project Language service for contents of template strings.
 * @param templateSettings Determines how template strings are processed.
 *
 * @return A copy of the language service with the template language applied. Does not mutate the input language service.
 */
export function decorateWithTemplateLanguageService(
	typescript: typeof ts,
	languageService: ts.LanguageService,
	project: ts.server.Project,
	templateService: TemplateLanguageService,
	templateSettings: TemplateSettings
): ts.LanguageService {
    let provider = new TemplateContextProvider(
        typescript,
        project,
        templateSettings
    )

	return new TemplateLanguageServiceDecorator(
		typescript,
		provider,
		templateService
	).decorate(languageService)
}
