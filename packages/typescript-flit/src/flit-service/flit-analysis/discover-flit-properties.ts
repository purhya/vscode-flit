import * as ts from 'typescript/lib/tsserverlibrary'
import {getNodeDescription, getNodeMemberVisibility, hasModifierForNode} from '../../ts-utils/ast-utils'


/** Discovers public properties from class. */
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
function matchFlitComponentProperty(node: ts.ClassElement, typescript: typeof ts, checker: ts.TypeChecker): FlitProperty | null {
	// `class {property = value, property: type = value}`, property must be public and not readonly.
	if (typescript.isPropertyDeclaration(node) || typescript.isPropertySignature(node)) {
		if (typescript.isIdentifier(node.name) || typescript.isStringLiteralLike(node.name)) {
			let bePublic = getNodeMemberVisibility(node, typescript) === 'public'
			let beReadOnly = hasModifierForNode(node, typescript.SyntaxKind.ReadonlyKeyword)
			let beStatic = hasModifierForNode(node, typescript.SyntaxKind.StaticKeyword)

			if (!beReadOnly && !beStatic) {
				return {
					name: node.name.getText(),
					nameNode: node,
					type: checker.getTypeAtLocation(node),
					description: getNodeDescription(node, typescript),
					sourceFile: node.getSourceFile(),
					public: bePublic,
				}
			}
		}
	}

	// `class {set property(value)}`
	else if (typescript.isSetAccessor(node)) {
		if (typescript.isIdentifier(node.name)) {
			let firstParameter = node.parameters?.[0]
			let type = checker.getTypeAtLocation(firstParameter || node)
			let bePublic = getNodeMemberVisibility(node, typescript) === 'public'
			let beStatic = hasModifierForNode(node, typescript.SyntaxKind.StaticKeyword)

			if (!beStatic) {
				return{
					name: node.name.getText(),
					nameNode: node,
					type,
					description: getNodeDescription(node, typescript),
					sourceFile: node.getSourceFile(),
					public: bePublic,
				}
			}
		}
	}

	// flit library doesn't like getters, so not check it.

	return null
}


/** Discovers sub properties from class, like `refs` or slots. */
export function discoverFlitSubProperties(declaration: ts.ClassLikeDeclaration, subPropertyName: string, typescript: typeof ts, checker: ts.TypeChecker): FlitProperty[] | null {
	let properties: FlitProperty[] | null = null


	let member = declaration.members.find(member => {
		return member.name?.getText() === subPropertyName
	})

	if (!member) {
		return null
	}

	let typeNode = member.getChildren().find(child => typescript.isTypeNode(child))
	if (!typeNode) {
		return null
	}
	
	// refs: {...}
	if (typescript.isTypeLiteralNode(typeNode)) {
		properties = []

		for (let typeMember of typeNode.members) {

			// `{property: type}`.
			if (typescript.isPropertySignature(typeMember) && typescript.isIdentifier(typeMember.name)) {
				let property: FlitProperty = {
					name: typeMember.name.getText(),
					nameNode: typeMember,
					type: checker.getTypeAtLocation(typeMember),
					description: getNodeDescription(typeMember, typescript),
					sourceFile: typeMember.getSourceFile(),
					public: true,
				}

				properties.push(property)
			}
		}
	}

	return properties
}
