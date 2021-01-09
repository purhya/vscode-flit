import {Logger} from 'typescript-template-language-service-decorator'
import {config} from '../config'


/** 
 * Provide logger service, can be used to pass from ts service to template language service.
 * See https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
 */
export class LanguageServiceLogger implements Logger {

	constructor(
		private readonly info: ts.server.PluginCreateInfo
	) {}

	log(msg: string) {
		this.info.project.projectService.logger.info(`[${config.pluginName}] ${msg}`)
	}
}