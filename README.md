# GraphQL Code Generator plugin for Golang

> This package is a fork of ctison/graphql-codegen-golang with support for GraphQL fragments. It does not support subscriptions

## Roadmap

- [x] Generate types
- [x] Generate queries and mutations
- [x] Generate fragments
- [ ] Generate subscriptions
- [ ] Allow api client to accept a global http options (e.g. authorization header for a bearer token)

This package generates Golang types and requests which use:

- [bytes](https://pkg.go.dev/bytes)
- [encoding/json](https://pkg.go.dev/encoding/json)
- [fmt](https://pkg.go.dev/fmt)
- [net/http](https://pkg.go.dev/net/http)
- [io/ioutil](https://pkg.go.dev/io/ioutil)
- [strings](https://pkg.go.dev/strings)

## Install

The package is published to [@jaredpalmer/graphql-codegen-golang](https://www.npmjs.com/package/@jaredpalmer/graphql-codegen-golang).

```
npm install -D @jaredpalmer/graphql-codegen-golang
yarn install -D @jaredpalmer/graphql-codegen-golang
```

## Usage: `codegen.yaml`

```yaml
schema: pkg/graphql/schema.graphql
documents: pkg/graphql/!(schema).graphql
generates:
  pkg/graphql/graphql.go:
    hooks:
      afterOneFileWrite: go fmt
    plugins:
      - graphql-codegen-golang:
          packageName: graphql # default
```

## Configuration

Configuration source is at [src/config.ts](src/config.ts)

| Name        | Default | Description                           |
| ----------- | ------- | ------------------------------------- |
| packageName | graphql | Name of the generated Golang package. |

## License

MIT
