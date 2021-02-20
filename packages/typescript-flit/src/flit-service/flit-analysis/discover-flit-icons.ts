import * as ts from 'typescript/lib/tsserverlibrary'
import {getNodeDescription, matchNodeDescentUnNesting} from '../../ts-utils/ast-utils'


export interface FlitIcon {
	name: string
	declaration: ts.ImportDeclaration
	description: string | null
}


/** Discovers imported icons from `import XXX from '...svg'`. */
export function discoverFlitIcons(sourceFile: ts.SourceFile, typescript: typeof ts): FlitIcon[] {
	return matchNodeDescentUnNesting(sourceFile, child => matchFlitIcon(child, typescript))
}


/** Matches `import XXX from '...svg'`. */
function matchFlitIcon(node: ts.Node, typescript: typeof ts): FlitIcon | null {
	if (typescript.isImportDeclaration(node)) {
		if (node.moduleSpecifier && /\.svg['"]/.test(node.moduleSpecifier.getText())) {
			return {
				name: node.moduleSpecifier.getText().match(/([\w-]+)\.svg['"]/)?.[1] || '',
				declaration: node,
				description: getNodeDescription(node, typescript),
			}
		}
	}

	return null
}
