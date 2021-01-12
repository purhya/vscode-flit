import * as ts from 'typescript/lib/tsserverlibrary'
import {discoverFlitBindings, discoverFlitComponents} from './flit-discover/discover-flit-components'
import {discoverFlitEvents} from './flit-discover/discover-flit-events'
import {discoverFlitInheritance} from './flit-discover/discover-flit-inheritance'
import {discoverFlitProperties} from './flit-discover/discover-flit-properties'
import {FlitBinding, FlitComponent, FlitEvent, FlitProperty} from './flit-discover/types'
import {getNodeDescription} from './ts-utils/ast-utils'


export class FlitAnalyzer {

	private components: Map<ts.Declaration, FlitComponent> = new Map()
	private bindings: Map<string, FlitBinding> = new Map()
	private files: Set<ts.SourceFile> = new Set()
	private tsService: ts.LanguageService

	constructor(
		private typescript: typeof ts,
		project: ts.server.Project,
	) {
		this.tsService = project.getLanguageService()
	}

	get program() {
		return this.tsService.getProgram()!
	}

	get typeChecker() {
		return this.program.getTypeChecker()
	}

	/** Update to makesure reloading changed source files. */
	update() {
		let {changedFiles, expiredFiles} = this.getChangedAndExpiredFiles()
		let heritagesExpiredComponent = this.makeFilesExpire(expiredFiles)

		for (let file of changedFiles) {
			this.analysisTSFile(file)
		}

		for (let component of heritagesExpiredComponent) {
			component.heritages = this.analysisAndGetHeritages(component.declaration, component.sourceFile)
		}
	}

	/** Get changed or new files but exclude `lib.???.d.ts`. */
	private getChangedAndExpiredFiles() {
		let newFiles = new Set(
			this.program.getSourceFiles()
				.filter(file => !/lib\.[^\\\/]+\.d\.ts$/.test(file.fileName) && file.fileName.includes('checkbox'))
		)

		let changedFiles: Set<ts.SourceFile> = new Set()
		let expiredFiles: Set<ts.SourceFile> = new Set()

		for (let file of newFiles) {
			if (!this.files.has(file)) {
				changedFiles.add(file)
			}
		}

		for (let file of this.files) {
			if (!newFiles.has(file)) {
				expiredFiles.add(file)
			}
		}

		this.files = newFiles

		return {changedFiles, expiredFiles}
	}

	/** Make parsed results in given files expired. */
	private makeFilesExpire(files: Set<ts.SourceFile>) {
		let heritagesExpired: Set<FlitComponent> = new Set()

		for (let [declaration, component] of [...this.components.entries()]) {
			if (files.has(component.sourceFile)) {
				this.components.delete(declaration)
			}
		}

		for (let component of this.components.values()) {
			if (component.heritages && component.heritages.some(heritage => files.has(heritage.sourceFile))) {
				component.heritages = []
				heritagesExpired.add(component)
			}
		}

		for (let [bindingName, binding] of [...this.bindings.entries()]) {
			if (files.has(binding.sourceFile)) {
				this.bindings.delete(bindingName)
			}
		}

		return heritagesExpired
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

		for (let property of discoverFlitProperties(declaration, this.typescript)) {
			properties.set(property.name, property)
		}

		for (let event of discoverFlitEvents(declaration, this.typescript, this.typeChecker)) {
			events.set(event.name, event)
		}
		
		let heritages = this.analysisAndGetHeritages(declaration, sourceFile)

		let component = {
			name: null,
			nameNode: null,
			description: getNodeDescription(declaration),
			sourceFile,
			declaration,
			properties,
			events,
			heritages,
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
		let binding = {
			name,
			nameNode,
			description: getNodeDescription(declaration),
			sourceFile,
			declaration,
		}

		this.bindings.set(name, binding)
	}

	/** Get components that name starts with label. */
	getComponentsForCompletion(label: string): FlitComponent[] {
		return [...this.components.values()].filter(component => {
			return component.name?.startsWith(label)
		})
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

		let properties = [...component.properties.values()].filter(property => {
			return property.name.startsWith(label)
		})

		return properties
	}

	/** Get properties for component defined with `tagName`, and property starts with label. */
	getComponentEventsForCompletion(label: string, tagName: string): FlitEvent[] | null {
		let component = [...this.components.values()].find(component => component.name === tagName)
		if (!component) {
			return null
		}

		let events = [...component.events.values()].filter(event => {
			return event.name.startsWith(label)
		})

		return events
	}
}