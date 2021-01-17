import * as ts from 'typescript/lib/tsserverlibrary'
import {getLanguageService as getHTMLLanguageService, LanguageService as HTMLLanguageService} from 'vscode-html-languageservice'
import {LanguageService as CSSLanguageService} from 'vscode-css-languageservice'
import {config} from './config'
import {TemplateLanguageServiceRouter} from './template-service/template-service-router'
import {Logger} from './helpers/logger'
import {getFlitCSSLanguageService} from './helpers/css-language-service'
import {decorateWithTemplateLanguageService} from './template-decorator'


/** Class as entry of the ts plugin. */
class HTMLPlugin implements ts.server.PluginModule{

	private readonly htmlLanguageService: HTMLLanguageService = getHTMLLanguageService()
	private readonly cssLanguageService: CSSLanguageService = getFlitCSSLanguageService()

	/** Avoid decorated ts language server for twice. */
	private decoratedServices: WeakMap<ts.LanguageService, ts.LanguageService> = new WeakMap()

	constructor(
		private readonly typescript: typeof ts
	) {}

	create(info: ts.server.PluginCreateInfo): ts.LanguageService {
		if (this.decoratedServices.has(info.languageService)) {
			return this.decoratedServices.get(info.languageService)!
		}

		let decoratedLanguageService = this.createTemplateLanguageService(info)
		this.decoratedServices.set(info.languageService, decoratedLanguageService)

		return decoratedLanguageService
	}

	/** Create the language service to give service for template codes. */
	private createTemplateLanguageService(info: ts.server.PluginCreateInfo): ts.LanguageService {
		new Logger(info)

		let templateLanguageService = new TemplateLanguageServiceRouter(
			this.typescript,
			info.languageService,
			this.htmlLanguageService,
			this.cssLanguageService
		)

		let languageService = decorateWithTemplateLanguageService(
			this.typescript,
			info.languageService,
			info.project,
			templateLanguageService,
			{
				tags: config.tags,
				getSubstitutions: this.getTemplateSubstitutions.bind(this)
			}
		)

		return languageService
	}

	/** Will replace slots `${...}` inside template to spaces or others. */
	private getTemplateSubstitutions(templateString: string, locations: readonly {start: number; end: number}[]) {
		let parts: string[] = []
		let lastIndex = 0
		let isHTMLDocument = /^\s*</.test(templateString)

		for (const span of locations) {
			parts.push(templateString.slice(lastIndex, span.start))
			parts.push(this.getTemplateSubstitution(templateString, span.start, span.end, isHTMLDocument))
			lastIndex = span.end
		}

		parts.push(templateString.slice(lastIndex))

		return parts.join('')
	}

	private getTemplateSubstitution(templateString: string, start: number, end: number, isHTMLDocument: boolean) {
		if (isHTMLDocument) {
			let previousChars = templateString.slice(start - 2, start)

			// `property=${...}` -> `property="   "`
			if (previousChars.includes('=') && !previousChars.includes('"') && !previousChars.includes('\'')) {
				return '"' + ' '.repeat(end - start - 2) + '"'
			}
			else {	
				return ' '.repeat(end - start)
			}
		}
		else {
			return 'x'.repeat(end - start)
		}
	}

	onConfigurationChanged(_config: any) {}
}


export = ((mod: {typescript: typeof ts}) => {
	return new HTMLPlugin(mod.typescript)
}) as ts.server.PluginModuleFactory
