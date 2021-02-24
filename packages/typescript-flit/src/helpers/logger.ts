import {config} from '../config'


/** 
 * Provide logger service, can be used to pass from ts service to template language service.
 * See https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
 */
export class Logger implements Logger {

	constructor(
		private readonly info: ts.server.PluginCreateInfo
	) {
		latestLogger = this
	}

	log(message: string) {
		this.info.project.projectService.logger.info(`[${config.pluginName}] ${message}`)
	}
}


let latestLogger: Logger

/** It's very complex to pass logger object, so here give a quick log to print debug info into typescript logs. */
export function quickLog(message: any) {
	if (latestLogger) {
		if (typeof(message) === 'object') {
			latestLogger.log(JSON.stringify(message))
		}
		else {
			latestLogger.log(String(message))
		}
	}
}


/** Print debug info into typescript logs. */
export function quickDebug(message: any) {
	if (config.debugging) {
		quickLog(message)
	}
}


/** Print debug info into typescript logs. */
export function mayDebug(message: () => any) {
	if (config.debugging) {
		quickLog(message())
	}
}