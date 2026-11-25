# supervisor

Supervisão de processos, readiness, reinício e intenção persistida.

Implementação em [LógosType](https://github.com/ThinkIac/LogosType). Migração sem novos recursos, preservando interfaces existentes.

## Instalação

```sh
npm install ThinkIac/supervisor#main
```

Nome npm: `@logos/supervisor`. Node >=22. Use SHA completo no lugar de main para reprodução. npm prepare compila fontes na instalação Git; tarballs incluem dist e dispensam compilador em produção.

## Exemplo

```js
// CLI:
// logos-supervisor validate --root /projeto
// logos-supervisor run --root /projeto
// logos-supervisor status --root /projeto
```

## Estrutura

- src/**/*.type: fontes mantidos.
- dist/**/*.cjs: compilados, com aliases .js para imports sem extensão.
- Entradas JS/CJS públicas: fachadas compatíveis.
- scripts/build.cjs: compilação com logostype fixado por commit.
- test/reference: originais para comparação, excluídos da distribuição.
- test/*.test.cjs: comportamento e regressões.

## Desenvolvimento

```sh
npm ci
npm test
npm pack
```

CI em Node 22 e 24 no Linux. [Contratos](docs/contracts.md). [Migração](docs/migration.md).

## Limites

Mantém APIs Node e dependências nativas. Não é uma demonstração de portabilidade para QuickJS/ESP32. A instalação não reinicia o Runtime nem instala serviços do sistema. Testes demonstram os casos cobertos, sem provar equivalência universal.

[Operação detalhada e configuração preservadas](docs/operation.md).
