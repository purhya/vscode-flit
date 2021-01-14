import * as ts from 'typescript/lib/tsserverlibrary'
import {resolveNodeDeclarationsDeep} from '../../ts-utils/ast-utils'


/** Discovers inheritance from given node by looking at `extends`. */
export function discoverFlitInheritance(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): ts.ClassLikeDeclaration[] | null {
	// Resolve the class structure of the node.
	let classNode = resolveClassStructure(node, typescript, checker)
	if (!classNode || !classNode.heritageClauses) {
		return null
	}

	let heritages: ts.ClassLikeDeclaration[] = []

	// Resolve inheritance.
	for (let heritage of classNode.heritageClauses) {
		for (let type of heritage.types) {
			let superClass = resolveClassStructure(type, typescript, checker)
			if (superClass) {
				heritages.push(superClass)
			}
		}
	}
	
	return heritages
}


/** Find true class definition. */
function resolveClassStructure(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): ts.ClassLikeDeclaration | null {
	// Resolve it if node is an identifier.
	if (typescript.isIdentifier(node)) {
		let declrations = resolveNodeDeclarationsDeep(node, typescript, checker)
		for (let declration of declrations) {
			if (typescript.isClassDeclaration(declration)) {
				return declration
			}
		}
	}

	// Resolve following assignment.
	else if (typescript.isVariableDeclaration(node) && (node.initializer || node.type)) {
		return resolveClassStructure((node.initializer || node.type)!, typescript, checker)
	}

	// Is a class, ignores interfaces.
	else if (typescript.isClassDeclaration(node)) {
		return node
	}

	return null
}