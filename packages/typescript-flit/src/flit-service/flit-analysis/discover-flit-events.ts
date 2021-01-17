import * as ts from 'typescript/lib/tsserverlibrary'
import {getNodeDescription, resolveNodeDeclarations, splitIntersectionTypes} from '../../ts-utils/ast-utils'
import {FlitEvent} from './types'


/** Discovers event emitter from `extends Component<XXXEvents>`. */
export function discoverFlitEvents(declaration: ts.ClassLikeDeclaration, typescript: typeof ts, checker: ts.TypeChecker): FlitEvent[] {
	let events: FlitEvent[] = []

	if (declaration.heritageClauses) {
		for (let heritage of declaration.heritageClauses) {
			if (heritage.token !== typescript.SyntaxKind.ExtendsKeyword) {
				continue
			}

			events.push(...discoverHeritageEvents(heritage, typescript, checker))
		}
	}

	return events
}


/** Discovers from syntax `extends A<B, C>, D`, heritage.types is `[A<B, C>, D]`. */
function discoverHeritageEvents(heritage: ts.HeritageClause, typescript: typeof ts, checker: ts.TypeChecker) {
	let events: FlitEvent[] = []

	for (let heritageType of heritage.types) {
		// heritageType is `A<B, C>`, typeArguments is `[B, C]`.
		let typeArguments = heritageType.typeArguments
		if (!typeArguments) {
			continue
		}

		// Enum `B, C`.
		for (let typeArgument of typeArguments) {
			// `E & F` -> `[E, F]`
			let splitedTypeArguments = splitIntersectionTypes(typeArgument, typescript)

			// Enum `E, F`
			for (let type of splitedTypeArguments) {
				events.push(...discoverFlitEvent(type, typescript, checker))
			}
		}
	}

	return events
}


/** Discover from each type arguments. */
function discoverFlitEvent(node: ts.TypeNode, typescript: typeof ts, checker: ts.TypeChecker) {
	let events: FlitEvent[] = []

	if (typescript.isTypeReferenceNode(node)) {
		if (node.typeName.getText().includes('Events')) {
			let declrations = resolveNodeDeclarations(node.typeName, typescript, checker)

			for (let declration of declrations) {
				if (typescript.isInterfaceDeclaration(declration)) {
					events.push(...discoverFlitInterfaceProperties(declration, typescript, checker))
				}
			}
		}
	}

	return events
}


/** Discovers public properties from interface. */
function discoverFlitInterfaceProperties(declaration: ts.InterfaceDeclaration, typescript: typeof ts, checker: ts.TypeChecker): FlitEvent[] {
	let events: FlitEvent[] = []

	for (let member of declaration.members) {
		let property = matchFlitInterfaceProperty(member, typescript, checker)
		if (property) {
			events.push(property)
		}
	}

	return events
}


/** Matches interface properties. */
function matchFlitInterfaceProperty(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): FlitEvent | null {
	// interface {property: Type}`
	if (typescript.isPropertySignature(node)) {
		if (typescript.isIdentifier(node.name) || typescript.isStringLiteralLike(node.name)) {
			return {
				name: node.name.getText(),
				nameNode: node,
				type: checker.getTypeAtLocation(node),
				description: getNodeDescription(node, typescript),
				sourceFile: node.getSourceFile(),
			}
		}
	}

	return null
}
