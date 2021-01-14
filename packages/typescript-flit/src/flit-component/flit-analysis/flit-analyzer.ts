import * as ts from 'typescript/lib/tsserverlibrary'
import {discoverFlitBindings, discoverFlitComponents} from './discover-flit-components'
import {discoverFlitEvents} from './discover-flit-events'
import {discoverFlitInheritance} from './discover-flit-inheritance'
import {discoverFlitProperties} from './discover-flit-properties'
import {FlitBinding, FlitComponent, FlitEvent, FlitProperty} from './types'
import {getNodeDescription} from '../../ts-utils/ast-utils'


export class FlitAnalyzer {

	/** Last analysised source files. */
	private files: Set<ts.SourceFile> = new Set()

	/** Analysised components. */
	private components: Map<ts.Declaration, FlitComponent> = new Map()

	/** Analysised bindings. */
	private bindings: Map<string, FlitBinding> = new Map()

	/** Analysised components, but heritages not been analysised because expired or can't been resolved. */
	private notResolvedHeritagesComponents: Set<FlitComponent> = new Set()

	constructor(
		private readonly typescript: typeof ts,
		private readonly tsLanguageService: ts.LanguageService
	) {}

	get program() {
		return this.tsLanguageService.getProgram()!
	}

	get typeChecker() {
		return this.program.getTypeChecker()
	}

	/** Format type to a readable description. */
	getTypeDescription(type: ts.Type) {
		return this.typeChecker.typeToString(type)
	}

	/** Update to makesure reloading changed source files. */
	update() {
		let changedFiles = this.getChangedAndExpiredFiles()

		for (let file of changedFiles) {
			this.analysisTSFile(file)
		}

		// If `extends XXX` can't been resolved, keeps it in `notResolvedHeritagesComponents` and check it every time.
		if (changedFiles.size > 0) {
			for (let component of [...this.notResolvedHeritagesComponents]) {
				let heritages = this.analysisAndGetHeritages(component.declaration, component.sourceFile)
				if (heritages) {
					component.heritages = this.analysisAndGetHeritages(component.declaration, component.sourceFile)
					this.notResolvedHeritagesComponents.delete(component)
				}
			}
		}
	}

	/** Get changed or new files but exclude `lib.???.d.ts`. */
	private getChangedAndExpiredFiles() {
		// All files exclude typescript lib files.
		let allFiles = new Set(
			this.program.getSourceFiles()
				.filter(file => !/lib\.[^\\\/]+\.d\.ts$/.test(file.fileName))
		)

		let changedFiles: Set<ts.SourceFile> = new Set()
		let expiredFiles: Set<ts.SourceFile> = new Set()

		for (let file of allFiles) {
			if (!this.files.has(file)) {
				changedFiles.add(file)
			}
		}

		for (let file of this.files) {
			if (!allFiles.has(file)) {
				expiredFiles.add(file)
			}
		}

		this.makeFilesExpire(expiredFiles)
		this.files = allFiles

		return changedFiles
	}

	/** Make parsed results in given files expired. */
	private makeFilesExpire(files: Set<ts.SourceFile>) {
		// Defined component expired.
		for (let [declaration, component] of [...this.components.entries()]) {
			if (files.has(component.sourceFile)) {
				this.components.delete(declaration)
				this.notResolvedHeritagesComponents.delete(component)
			}
		}

		// Heritages expired.
		for (let component of this.components.values()) {
			if (component.heritages && component.heritages.some(heritage => files.has(heritage.sourceFile))) {
				component.heritages = []
				this.notResolvedHeritagesComponents.add(component)
			}
		}

		// Binding expired.
		for (let [bindingName, binding] of [...this.bindings.entries()]) {
			if (files.has(binding.sourceFile)) {
				this.bindings.delete(bindingName)
			}
		}
	}

	/** Analysis each ts file. */
	private analysisTSFile(sourceFile: ts.SourceFile) {
		let components = discoverFlitComponents(sourceFile, this.typescript, this.typeChecker)
		let bindings = discoverFlitBindings(sourceFile, this.typescript, this.typeChecker)

		for (let component of components) {
			this.analysisDefinedComponent(component.name, component.nameNode, component.declaration, sourceFile)
		}
	
		for (let binding of bindings) {
			this.analysisBinding(binding.name, binding.nameNode, binding.declaration, sourceFile)
		}
	}

	/** Makesure component analysised and returns result. */
	private getAnalysisedBaseComponent(declaration: ts.ClassLikeDeclaration, sourceFile: ts.SourceFile): FlitComponent {
		if (!this.components.has(declaration)) {
			this.analysisBaseComponent(declaration, sourceFile)
		}

		return this.components.get(declaration)!
	}

	/** Analysis one component declaration. */
	private analysisDefinedComponent(name: string, nameNode: ts.Node, declaration: ts.ClassLikeDeclaration, sourceFile: ts.SourceFile) {
		if (!this.components.has(declaration)) {
			this.analysisBaseComponent(declaration, sourceFile)
		}

		// May analysised from heritage, here upgrade it.
		let component = this.components.get(declaration)!
		component.name = name
		component.nameNode = nameNode
	}
	
	/** Analysis one component declaration. */
	private analysisBaseComponent(declaration: ts.ClassLikeDeclaration, sourceFile: ts.SourceFile) {
		let properties: Map<string, FlitProperty> = new Map()
		let events: Map<string, FlitEvent> = new Map()

		for (let property of discoverFlitProperties(declaration, this.typescript, this.typeChecker)) {
			properties.set(property.name, property)
		}

		for (let event of discoverFlitEvents(declaration, this.typescript, this.typeChecker)) {
			events.set(event.name, event)
		}
		
		let heritages = this.analysisAndGetHeritages(declaration, sourceFile)

		let component: FlitComponent = {
			name: null,
			nameNode: null,
			declaration,
			type: this.typeChecker.getTypeAtLocation(declaration),
			description: getNodeDescription(declaration),
			properties,
			events,
			heritages,
			sourceFile,
		}

		this.components.set(declaration, component)
	}

	/** Analysis heritages and returns result. */
	private analysisAndGetHeritages(declaration: ts.ClassLikeDeclaration, sourceFile: ts.SourceFile) {
		let heritages: FlitComponent[] = []
		let heritageDeclarations = discoverFlitInheritance(declaration, this.typescript, this.typeChecker)

		if (heritageDeclarations) {
			for (let declaration of heritageDeclarations) {
				let heritage = this.getAnalysisedBaseComponent(declaration, sourceFile)
				heritages.push(heritage)
			}
		}

		return heritages
	}
	
	/** Analysis one binding declaration. */
	private analysisBinding(name: string, nameNode: ts.Node, declaration: ts.Declaration, sourceFile: ts.SourceFile) {
		let binding: FlitBinding = {
			name,
			nameNode,
			declaration,
			type: this.typeChecker.getTypeAtLocation(declaration),
			description: getNodeDescription(declaration),
			sourceFile,
		}

		this.bindings.set(name, binding)
	}

	/** Get components that name starts with label. */
	getComponentsForCompletion(label: string): FlitComponent[] {
		let components: FlitComponent[] = []

		for (let component of this.components.values()) {
			if (component.name?.startsWith(label)) {
				components.push(component)
			}
		}

		return components
	}

	/** Get bindings that name starts with label. */
	getBindingsForCompletion(label: string): FlitBinding[] {
		let bindings: FlitBinding[] = []

		for (let binding of this.bindings.values()) {
			if (binding.name.startsWith(label)) {
				bindings.push(binding)
			}
		}

		return bindings
	}

	/** Get properties for component defined with `tagName`, and property starts with label. */
	getComponentPropertiesForCompletion(label: string, tagName: string): FlitProperty[] | null {
		let component = [...this.components.values()].find(component => component.name === tagName)
		if (!component) {
			return null
		}
		
		let properties: Map<string, FlitProperty> = new Map()

		for (let com of this.walkComponents(component)) {
			for (let property of com.properties.values()) {
				if (property.name.startsWith(label) && !properties.has(property.name)) {
					properties.set(property.name, property)
				}
			}
		}

		return [...properties.values()]
	}

	/** Walk component and it's heritages. */
	private *walkComponents(component: FlitComponent, deep = 0): Generator<FlitComponent> {
		yield component

		for (let heritage of component.heritages) {
			yield *this.walkComponents(heritage, deep + 1)
		}
	}

	/** Get properties for component defined with `tagName`, and property starts with label. */
	getComponentEventsForCompletion(label: string, tagName: string): FlitEvent[] | null {
		let component = [...this.components.values()].find(component => component.name === tagName)
		if (!component) {
			return null
		}

		let events: Map<string, FlitEvent> = new Map()

		for (let com of this.walkComponents(component)) {
			for (let event of com.events.values()) {
				if (event.name.startsWith(label) && !events.has(event.name)) {
					events.set(event.name, event)
				}
			}
		}

		return [...events.values()]
	}

	/** Get components that name starts with label. */
	getComponent(label: string): FlitComponent | null {
		for (let component of this.components.values()) {
			if (component.name === label) {
				return component
			}
		}
		
		return null
	}

	/** Get bindings that name starts with label. */
	getBinding(label: string): FlitBinding | null {
		for (let binding of this.bindings.values()) {
			if (binding.name === label) {
				return binding
			}
		}

		return null
	}

	/** Get properties for component defined with `tagName`, and property starts with label. */
	getComponentProperty(label: string, tagName: string): FlitProperty | null {
		let component = [...this.components.values()].find(component => component.name === tagName)
		if (!component) {
			return null
		}
	
		for (let com of this.walkComponents(component)) {
			for (let property of com.properties.values()) {
				if (property.name === label) {
					return property
				}
			}
		}

		return null
	}

	/** Get properties for component defined with `tagName`, and property starts with label. */
	getComponentEvent(label: string, tagName: string): FlitEvent | null {
		let component = [...this.components.values()].find(component => component.name === tagName)
		if (!component) {
			return null
		}

		for (let com of this.walkComponents(component)) {
			for (let event of com.events.values()) {
				if (event.name === label) {
					return event
				}
			}
		}

		return null
	}
}