import * as ts from 'typescript/lib/tsserverlibrary'
import {FlitToken, FlitTokenType} from './flit-toker-scanner'
import {FlitAnalyzer} from './flit-analysis/flit-analyzer'
import {getScriptElementKindFromToken, splitPropertyAndModifiers} from './utils'
import {findNodeAscent, getNodeIdentifier, getNodeName} from '../ts-utils/ast-utils'


/** Provide flit definition service. */
export class FlitDefinition {

	constructor(
		private readonly analyzer: FlitAnalyzer,
		private readonly typescript: typeof ts
	) {}
	
	getDefinition(token: FlitToken, contextNode: ts.Node): ts.DefinitionInfoAndBoundSpan | null {
		// tag
		if (token.type === FlitTokenType.StartTag) {
			let component = this.analyzer.getComponent(token.attrName)
			return this.makeDefinitionInfo(component, token)
		}

		// :xxx
		else if (token.type === FlitTokenType.Binding) {
			let binding = this.getBindingDefinitionItems(token, contextNode)
			return this.makeDefinitionInfo(binding, token)
		}

		// .xxx
		else if (token.type === FlitTokenType.Property) {
			let property = this.analyzer.getComponentProperty(token.attrName, token.tagName)
			return this.makeDefinitionInfo(property, token)
		}

		// @@xxx
		else if (token.type === FlitTokenType.ComEvent) {
			let event = this.analyzer.getComponentEvent(token.attrName, token.tagName)
			return this.makeDefinitionInfo(event, token)
		}

		return null
	}
	
	private getBindingDefinitionItems(token: FlitToken, contextNode: ts.Node) {
		let [bindingName] = splitPropertyAndModifiers(token.attrName)

		// If `:ref="|"`.
		if (token.attrValue !== null && ['ref', 'slot'].includes(token.attrName)) {
			let attrValue = token.attrValue.replace(/^['"](.*?)['"]$/, '$1')
			let componentPropertyName = token.attrName + 's' as 'refs' | 'slots'
			let customTagName: string | null = null
			
			token.attrPrefix = '.'
			token.attrName = componentPropertyName + '.' + attrValue

			// Get ancestor class declaration.
			if (token.attrName === 'ref') {
				let declaration = findNodeAscent(contextNode, child => this.typescript.isClassLike(child)) as ts.ClassLikeDeclaration
				if (!declaration) {
					return null
				}

				customTagName = this.analyzer.getComponentByDeclaration(declaration)?.name || null
			}
			// Get closest component tag.
			else {
				customTagName = token.closestCustomTagName
			}

			if (!customTagName) {
				return null
			}

			let item = this.analyzer.getSubProperties(componentPropertyName, attrValue, customTagName)
			if (item) {
				return item
			}
		}

		// In `:class` range part.
		if (token.cursorOffset < 1 + bindingName.length) {
			token.end = token.start + 1 + bindingName.length
			token.attrName = bindingName

			let binding = this.analyzer.getBinding(token.attrName)
			return binding
		}
		
		return null
	}

	private makeDefinitionInfo(
		item: {name: string | null, nameNode: ts.Node | null, declaration?: ts.Declaration} | null,
		token: FlitToken
	): ts.DefinitionInfoAndBoundSpan | null{
		if (!item) {
			return null
		}

		let node = item.declaration ? getNodeIdentifier(item.declaration, this.typescript) || item.nameNode! : item.nameNode!
		let name = item.name || getNodeName(node, this.typescript) || ''
		let kind = getScriptElementKindFromToken(token, this.typescript)
		let fileName = node.getSourceFile().fileName

		let textSpan: ts.TextSpan = {
			start: node.getStart(),
			length: node.getWidth(),
		}

		let info: ts.DefinitionInfo = {
			textSpan,
			fileName,
			kind,
			name,
			containerName: fileName,
			containerKind: this.typescript.ScriptElementKind.scriptElement,
		}

		let fromTextSpan = {
			start: token.start,
			length: token.end - token.start,
		}

		return {
			definitions: [info],
			textSpan: fromTextSpan,
		}
	}
}