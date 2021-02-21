import * as ts from 'typescript/lib/tsserverlibrary'
import ScriptSourceHelper from './helpers/script-source-helper'
import TemplateContext from './template-context'
import TemplateSettings from './template-settings'
import {filterNodeDescent, findNodeAscent} from '../ts-utils/ast-utils'
import {quickDebug} from '../helpers/logger'


export default class TemplateContextProvider {

	helper: ScriptSourceHelper
	private cache: TemplateContextCache = new TemplateContextCache()

	constructor(
		private readonly typescript: typeof ts,
		project: ts.server.Project,
		private readonly templateSettings: TemplateSettings
	) {
		this.helper = new ScriptSourceHelper(project)
	}

	/** Get a TemplateContext from specified position of source file. */
	getTemplateContextAtOffset(fileName: string, offset: number): TemplateContext | null {
		let sourceFile = this.helper.getSourceFile(fileName)
		let taggedNode = this.getTaggedNode(fileName, offset)

		if (!sourceFile || !taggedNode) {
			return null
		}

		let cacheItem = this.cache.get(sourceFile, taggedNode)
		let context: TemplateContext

		if (cacheItem) {
			context = cacheItem.context

			if (cacheItem.changed) {
				context.update()
			}
		}
		else {
			context = this.createTemplateContext(taggedNode, fileName)
			this.cache.add(sourceFile, taggedNode, context)
		}

		return context
	}

	private getTaggedNode(fileName: string, position: number) {
		let currentNode = this.helper.getNodeAtOffset(fileName, position)

		if (!currentNode) {
			return null
		}

		let taggedNode = findNodeAscent(currentNode, node => {
			// If meets xxx`...`, end.
			// If meets typescript expression, end too.
			return this.typescript.isTaggedTemplateExpression(node)
				|| !(
					this.typescript.isTemplateHead(node)
					|| this.typescript.isTemplateMiddleOrTemplateTail(node)
					|| this.typescript.isTemplateLiteral(node)
					|| this.typescript.isTemplateSpan(node)
				)
		}) as ts.TaggedTemplateExpression

		// Must recheck tag kind.
		if (!taggedNode || !this.typescript.isTaggedTemplateExpression(taggedNode)) {
			return null
		}

		// Check tag name is allowed.
		if (!this.templateSettings.tags.includes(taggedNode.tag.getText())) {
			return null
		}

		return taggedNode
	}

	private createTemplateContext(taggedNode: ts.TaggedTemplateExpression, fileName: string) {
		let templateLiteral = taggedNode.template
		let tagName = taggedNode.tag.getText()

		return new TemplateContext(
			templateLiteral,
			tagName,
			fileName,
			this.templateSettings,
			this.helper,
			this.typescript
		)
	}

	/** Get all TemplateContext from source file. */
	getAllTemplateContexts(fileName: string): TemplateContext[] {
		let sourceFile = this.helper.getSourceFile(fileName)
		if (!sourceFile) {
			return []
		}

		let taggedNodes = filterNodeDescent(sourceFile, node => {
			return this.typescript.isTaggedTemplateExpression(node)
		}) as ts.TaggedTemplateExpression[]

		taggedNodes = taggedNodes.filter(node => this.templateSettings.tags.includes(node.tag.getText()))

		return taggedNodes.map(node => this.createTemplateContext(node, fileName))
	}
}


type TemplateContextCacheItem = WeakMap<ts.TaggedTemplateExpression, {context: TemplateContext, fileSize: number}>


/** 
 * If source file not changed, can keep template context in cache.
 * If source file not touched for 5 minutes, clear cache.
 */
class TemplateContextCache {

	private cache: WeakMap<ts.SourceFile, TemplateContextCacheItem> = new WeakMap()
	private timeouts: WeakMap<ts.SourceFile, NodeJS.Timeout> = new WeakMap()

	get(sourceFile: ts.SourceFile, taggedNode: ts.TaggedTemplateExpression) {
		if (this.cache.has(sourceFile)) {
			this.resetTimeout(sourceFile)

			let item = this.cache.get(sourceFile)?.get(taggedNode)
			if (item) {
				let newFileSize = sourceFile.getFullWidth()
				let changed = item.fileSize !== newFileSize

				if (changed) {
					item.fileSize = newFileSize
				}

				return {
					context: item.context,
					changed,
				}
			}
		}

		return null
	}

	resetTimeout(sourceFile: ts.SourceFile) {
		let timeout = this.timeouts.get(sourceFile)
		if (timeout) {
			clearTimeout(timeout)
			timeout = setTimeout(() => this.clearSourceFile(sourceFile), 5 * 60 * 1000)
			this.timeouts.set(sourceFile, timeout)	
		}
	}

	private clearSourceFile(sourceFile: ts.SourceFile) {
		this.cache.delete(sourceFile)
		quickDebug('source file cleared')
	}

	add(sourceFile: ts.SourceFile, taggedNode: ts.TaggedTemplateExpression, context: TemplateContext) {
		let item = this.cache.get(sourceFile)
		if (!item) {
			item = new WeakMap()
			this.cache.set(sourceFile, item)
		}

		item.set(taggedNode, {
			context,
			fileSize: sourceFile.getFullWidth(),
		})

		this.resetTimeout(sourceFile)
	}
}
