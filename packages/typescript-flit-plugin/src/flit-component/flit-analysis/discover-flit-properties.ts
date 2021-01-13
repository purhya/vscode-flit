import * as ts from 'typescript/lib/tsserverlibrary'
import {getNodeDescription, getNodeMemberVisibility} from '../ts-utils/ast-utils'
import {FlitProperty} from './types'


/** Discovers public properties from class or interface. */
export function discoverFlitProperties(declaration: ts.ClassLikeDeclaration, typescript: typeof ts, checker: ts.TypeChecker): FlitProperty[] {
	let properties: FlitProperty[] = []

	for (let member of declaration.members) {
		let property = matchFlitComponentProperty(member, typescript, checker)
		if (property) {
			properties.push(property)
		}
	}

	return properties
}


/** Matches class properties from child nodes of a class declaration node. */
function matchFlitComponentProperty(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): FlitProperty | null {
	// `class {property = value}`
	if (typescript.isPropertyDeclaration(node) || typescript.isPropertySignature(node)) {
		if (typescript.isIdentifier(node.name) || typescript.isStringLiteralLike(node.name)) {
			let isPublic = getNodeMemberVisibility(node, typescript) === 'public'

			if (isPublic) {
				return {
					name: node.name.getText(),
					nameNode: node,
					type: checker.getTypeAtLocation(node),
					description: getNodeDescription(node),
					sourceFile: node.getSourceFile(),
				}
			}
		}
	}

	// `class {set property(value)}`
	else if (typescript.isSetAccessor(node)) {
		if (typescript.isIdentifier(node.name)) {
			let firstParameter = node.parameters.length > 0 ? node.parameters[0] : null
			let type = checker.getTypeAtLocation(firstParameter || node)

			return{
				name: node.name.getText(),
				nameNode: node,
				type,
				description: getNodeDescription(node),
				sourceFile: node.getSourceFile(),
			}
		}
	}

	return null
}
