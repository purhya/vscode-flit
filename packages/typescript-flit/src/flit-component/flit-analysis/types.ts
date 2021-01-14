export interface FlitComponent {

	/** Defined tagName in `define(name, ...)`. */
	name: string | null

	/** Node of it's defined name. */
	nameNode: ts.Node | null

	/** Defined declaration in `define(..., declaration)`. */
	declaration: ts.ClassLikeDeclaration

	/** Type of component. */
	type: ts.Type

	/** Description is just leading comment. */
	description: string | null

	/** Component public properties, not include properties of super class. */
	properties: Map<string, FlitProperty>

	/** Component events. */
	events: Map<string, FlitEvent>

	/** Direct super class, discovered from `... extends SuperClass`, not been resolved with super class chain. */
	heritages: FlitComponent[]

	/** Source file in. */
	sourceFile: ts.SourceFile
}


interface FlitBaseItem {

	/** Defined name in `define(name, ...)`. */
	name: string

	/** Node of it's defined name. */
	nameNode: ts.Node

	/** Description is just leading comment. */
	description: string | null

	/** Type of item. */
	type: ts.Type

	/** Source file in. */
	sourceFile: ts.SourceFile
}

export interface FlitBinding extends FlitBaseItem {

	/** Defined declaration in `defineBinding(..., declaration)`. */
	declaration: ts.Declaration
}

export interface FlitProperty extends FlitBaseItem {}

export interface FlitEvent extends FlitBaseItem {}