interface FlitBaseItem {

	/** Defined name in `define(name, ...)`, or property name event name. */
	readonly name: string

	/** Node of it's defined name. */
	readonly nameNode: ts.Node

	/** Description is just leading comment. */
	readonly description: string | null

	/** Type of item. */
	readonly type: ts.Type

	/** Source file in. */
	readonly sourceFile: ts.SourceFile
}

export interface FlitProperty extends FlitBaseItem {}

export interface FlitEvent extends FlitBaseItem {}

export interface FlitDefined extends Omit<FlitBaseItem, 'nameNode'> {

	/** Node of it's defined name. */
	readonly nameNode: ts.Node | null

	/** Defined declaration in `defineBinding(..., declaration)`. */
	readonly declaration: ts.ClassLikeDeclaration
}

export interface FlitBinding extends FlitDefined {}

export interface FlitComponent extends FlitDefined {

	/** Component public properties, not include properties of super class. */
	readonly properties: Map<string, FlitProperty>

	/** Component events. */
	readonly events: Map<string, FlitEvent>

	/** Direct super class, discovered from `... extends SuperClass`, not been resolved with super class chain. */
	heritages: FlitComponent[]
}
