import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { ESLint } from 'eslint'

const cwd = path.resolve(import.meta.dirname, '..')
const eslint = new ESLint({
  cwd,
  overrideConfig: { languageOptions: { parserOptions: { projectService: false } } },
})

for (const [layer, source] of [
  ['domain', "import 'react'"],
  ['domain', "import '../application/todoService'"],
  ['application', "import '../adapters/todoHttpGateway'"],
  ['application', "import('../../../api/client')"],
  ['application', "import '../../../shared/Diagnostics'"],
  ['application', "export * from '@/api/client'"],
  ['application', "export type Client = import('../../../api/client').ApiError"],
  ['application', "import client = require('../../../api/client')"],
  ['application', "require('../../../api/client')"],
  ['application', 'import(moduleName)'],
  ['application', "import '../domain/../adapters/todoHttpGateway'"],
  ['presentation', "import '@tanstack/react-db'"],
  ['presentation', "import '@tanstack/react-query'"],
  ['presentation', "import '../adapters/todoHttpGateway'"],
  ['presentation', "import '../../../shared/Diagnostics'"],
  ['adapters', "import '../bootstrap/todoComposition'"],
]) {
  test(`${layer} rejects ${source}`, async () => {
    const messages = await lint(layer, source)
    assert.ok(messages.some((message) => message.ruleId === 'architecture/feature-boundaries'))
  })
}

for (const [layer, source] of [
  ['domain', "import './todo'"],
  ['domain', "export type { Todo } from '@/features/todos/domain/todo'"],
  ['application', "import '../domain/todo'"],
  ['application', "import('@/features/todos/domain/todo')"],
  ['application', "import './ports'"],
  ['presentation', "import 'react'"],
  ['presentation', "import '@tanstack/react-form'"],
  ['presentation', "import 'zod'"],
  ['presentation', "import '@/components/ui/button'"],
  ['presentation', "import '../TodoPage.module.css'"],
  ['presentation', "import '../application/todoService'"],
  ['adapters', "import '@tanstack/react-db'"],
  ['adapters', "import '../../../api/client'"],
  ['adapters', "import '../application/ports'"],
  ['bootstrap', "import '../adapters/todoHttpGateway'"],
]) {
  test(`${layer} allows ${source}`, async () => {
    assert.deepEqual(await lint(layer, source), [])
  })
}

async function lint(layer, source) {
  const [result] = await eslint.lintText(source, {
    filePath: `src/features/todos/${layer}/boundary-probe.ts`,
  })
  return result.messages.filter(
    (message) => message.fatal || message.ruleId === 'architecture/feature-boundaries',
  )
}
