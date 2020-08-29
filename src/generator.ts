import { GolangPluginConfig } from './config'
import * as templates from './templates'
import { Liquid, Template } from 'liquidjs'
import {
  DocumentNode,
  EnumTypeDefinitionNode,
  GraphQLSchema,
  InputObjectTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  parse,
  print,
  printSchema,
  TypeInfo,
  TypeNode,
  VariableDefinitionNode,
  visit,
  visitWithTypeInfo,
} from 'graphql'

/**
 * GolangGenerator is a class that you instanciate with a GraphQL schema
 * and an optional configuration. You can then call its method `generate`
 * to generate Golang code.
 */
export class GolangGenerator {
  /**
   * The configuration used when generating Golang code.
   */
  readonly config: GolangPluginConfig
  /**
   * The GraphQL schema used to generate Golang code.
   */
  readonly schema: GraphQLSchema

  private templateEngine: Liquid
  private templateOperation: Template[]

  /**
   * Map GraphQL type to their Golang format.
   */
  readonly types: { [key: string]: string } = {
    Int: 'Int',
    Float: 'Float',
    Boolean: 'Boolean',
    String: 'String',
    ID: 'ID',
  }
  /**
   * Map GraphQL scalar types to Golang types.
   */
  readonly scalars: { [key: string]: string } = {
    Int: 'int32',
    Float: 'float64',
    Boolean: 'bool',
    String: 'string',
    ID: 'string',
  }
  private enums: EnumTypeDefinitionNode[] = []
  private inputs: InputObjectTypeDefinitionNode[] = []
  private objects: ObjectTypeDefinitionNode[] = []

  constructor(schema: GraphQLSchema, config?: GolangPluginConfig) {
    this.config = config ?? {}
    this.schema = schema
    this.templateEngine = new Liquid({
      strictFilters: true,
      strictVariables: true,
    })
    this.templateOperation = this.templateEngine.parse(
      templates.GOLANG_OPERATION
    )
    visit(parse(printSchema(this.schema)), {
      ScalarTypeDefinition: node => {
        this.types[node.name.value] = this.formatName(node.name.value)
        this.scalars[node.name.value] = 'string'
        return false
      },
      EnumTypeDefinition: node => {
        this.types[node.name.value] = this.formatName(node.name.value)
        this.enums.push(node)
        return false
      },
      InputObjectTypeDefinition: node => {
        this.types[node.name.value] = this.formatName(node.name.value)
        this.inputs.push(node)
        return false
      },
      ObjectTypeDefinition: node => {
        this.types[node.name.value] = this.formatName(node.name.value)
        this.objects.push(node)
        return false
      },
    })
  }

  generate(documents?: DocumentNode[]): string {
    const l = [
      ...this.generatePackage(),
      ...this.generateImports(),
      templates.GOLANG_BASE,
    ]
    documents?.forEach(document => l.push(...this.generateOperations(document)))
    l.push(...this.generateSchema())
    return l.join('\n')
  }

  /**
   * Format a name for Golang.
   * @param name Name to format.
   */
  private formatName(name: string): string {
    if (name.match(/^id$/i) || name.match(/^uuid$/i)) {
      return name.toUpperCase()
    }
    return name
      .replace(/(^_|_$)/, '')
      .split('_')
      .map(word => word[0].toUpperCase() + word.substr(1))
      .join('')
  }

  /**
   * Generate Golang package header.
   */
  private generatePackage(): string[] {
    return [
      `package ${this.config.packageName ?? 'graphql'}`,
      '',
      '// Code generated by graphql-codegen-golang ; DO NOT EDIT.',
      '',
    ]
  }

  /**
   * Generate Golang imports for operations.
   */
  private generateImports(): string[] {
    return [
      'import (',
      '  "bytes"',
      '  "encoding/json"',
      '  "fmt"',
      '  "io/ioutil"',
      '  "net/http"',
      '  "strings"',
      ')',
      '',
    ]
  }

  /**
   * Generate a named comment section.
   * @param name Name of the section.
   */
  private generateSection(name: string): string[] {
    return ['', '//', `// ${name}`, '//', '']
  }

  /**
   * Generate the Golang types from schema.
   */
  private generateSchema(): string[] {
    return [
      ...this.generateScalars(),
      ...this.generateEnums(),
      ...this.generateInputs(),
      ...this.generateObjects(),
    ]
  }

  private generateScalars(): string[] {
    const l = [...this.generateSection('Scalars')]
    Object.entries(this.scalars).map(([gqlType, goType]) => {
      l.push(`type ${this.types[gqlType]} ${goType}`)
    })
    return l
  }

  private generateEnums(): string[] {
    const l = [...this.generateSection('Enums')]
    this.enums.forEach(node => {
      const goType = this.types[node.name.value]
      l.push('', `type ${this.types[node.name.value]} string`, 'const (')
      node.values?.forEach(value => {
        const name = value.name.value
        l.push(`  ${goType}${this.formatName(name)} ${goType} = "${name}"`)
      })
      l.push(')')
    })
    return l
  }

  private generateInputs(): string[] {
    const l = [...this.generateSection('Inputs')]
    this.inputs.forEach(node => {
      const goType = this.types[node.name.value]
      l.push('', `type ${goType} struct {`)
      node.fields?.forEach(field => {
        l.push(this.generateField(field.name.value, field.type))
      })
      l.push('}')
    })
    return l
  }

  private generateObjects(): string[] {
    const l = [...this.generateSection('Objects')]
    this.objects.forEach(node => {
      const goType = this.types[node.name.value]
      l.push('', `type ${goType} struct {`)
      node.fields?.forEach(field => {
        l.push(this.generateField(field.name.value, field.type))
      })
      l.push('}')
    })
    return l
  }

  /**
   * Generate a Golang struct's field.
   * @param name Name of the GraphQL field.
   * @param type Type of the GraphQL field.
   */
  private generateField(name: string, type: TypeNode): string {
    return `  ${this.formatName(name)} ${this.generateFieldType(type, name)}`
  }

  /**
   *
   * @param type TypeNode contains a GraphQL type.
   * @param fieldName GraphQL field's name for the Golang's json annotation.
   * @param prefix String accumulator to add to result when recursion is done.
   * @param nonNull Boolean accumulator to determine if type must be a pointer.
   */
  private generateFieldType(
    type: TypeNode,
    fieldName: string,
    prefix = '',
    nonNull = false
  ): string {
    if (type.kind === 'NamedType') {
      return [
        `${nonNull ? '' : '*'}${prefix}`,
        `${this.types[type.name.value]} `,
        `\`json:"${fieldName}${nonNull ? '' : ',omitempty'}"\``,
      ].join('')
    }
    if (type.kind === 'NonNullType') {
      return this.generateFieldType(
        type.type,
        fieldName,
        prefix,
        prefix !== '' ? false : true
      )
    }
    if (type.kind === 'ListType') {
      return this.generateFieldType(
        type.type,
        fieldName,
        prefix + '[]',
        nonNull
      )
    }
    throw new Error(`field type "${type}" not supported!`)
  }

  /**
   * Generate operations code from a GraphQL document.
   * @param document Document to get the operations from.
   */
  private generateOperations(document: DocumentNode): string[] {
    const l: string[] = []
    const typeInfo = new TypeInfo(this.schema)
    visit(
      document,
      visitWithTypeInfo(typeInfo, {
        OperationDefinition: {
          enter: operation => {
            // Anonymous operation are not supported: skip them.
            if (!operation.name) return false
            // Subscription operations are not supported yes.
            if (operation.operation === 'subscription') return false
            const name = this.formatName(operation.name.value)
            l.push(
              ...this.generateSection(
                `${print(operation).split('{', 1)[0].trim()}`
              )
            )
            // Generate operation variables type if any
            l.push(
              ...this.generateOperationVariables(
                name,
                operation.variableDefinitions
              )
            )
            // Finally, operation's response type are generated when visiting
            // inner AST nodes
            l.push(`type ${name}Response struct {`)
          },
          leave: operation => {
            if (!operation.name) return
            // Inner nodes have been visited. Time to close response type.
            l.push('}', '')
            const name = this.formatName(operation.name.value)
            const hasVariables =
              this.generateOperationVariables(
                name,
                operation.variableDefinitions
              ).length > 0
            // Generate everything except variables and response type
            l.push(
              ...this.generateOperationCode(
                name,
                print(operation),
                hasVariables
              )
            )
          },
        },
        Field: {
          enter: field => {
            const name = this.formatName(field.name.value)
            const w = [`  ${name} `]
            if (field.selectionSet) {
              const outputType = typeInfo.getType()?.toString()
              if (outputType?.startsWith('[')) {
                if (!outputType.endsWith('!')) {
                  w.push('*')
                }
                w.push('[]')
              }
              w.push('struct {')
            } else {
              w.push(`string \`json:"${name}"\``)
            }
            l.push(w.join(''))
          },
          leave: field => {
            if (field.selectionSet) {
              const name = this.formatName(field.name.value)
              l.push(`} \`json:"${name}"\``)
            }
          },
        },
      })
    )
    return l
  }

  /**
   * Generate Golang `type ${name}Variables struct {...}`.
   * @param name Name of the operation. Must be formatted for Golang.
   * @param variableDefinitions GraphQL variables to generate Golang fields from.
   */
  private generateOperationVariables(
    name: string,
    variableDefinitions: readonly VariableDefinitionNode[] | undefined
  ): string[] {
    if (!variableDefinitions || variableDefinitions.length == 0) {
      return []
    }
    const l = [`type ${name}Variables struct {`]
    variableDefinitions.forEach(variable => {
      l.push(this.generateField(variable.variable.name.value, variable.type))
    })
    l.push('}', '')
    return l
  }

  /**
   * Generates all Golang code for an operation except `type ${name}Variables`
   * and `type ${name}Response`.
   * @param name Name of the operation. Must be formatted for Golang.
   * @param operation String version of the operation.
   * @param hasVariables Whether the operation uses a `${name}Variables` or not.
   */
  private generateOperationCode(
    name: string,
    operation: string,
    hasVariables: boolean
  ): string[] {
    const l: string[] = []
    l.push(
      this.templateEngine.renderSync(this.templateOperation, {
        name,
        operation,
        hasVariables,
      })
    )
    return l
  }
}