import path from 'node:path'

const sourceRoot = path.resolve(import.meta.dirname, '../src')
const allowedLayers = {
  domain: ['domain'],
  application: ['domain', 'application'],
  adapters: ['domain', 'application', 'adapters'],
  presentation: ['domain', 'application', 'presentation'],
}
const viewPackages = ['react', 'react-dom', '@tanstack/react-form', 'zod']

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      boundary: '{{layer}} cannot depend on {{dependency}}. Keep feature dependencies inward.',
      dynamic: 'Use a literal module path so feature dependencies can be checked.',
    },
  },
  create(context) {
    const filename = context.filename
    const [, feature, layer] = path.relative(sourceRoot, filename).split(path.sep)
    const layers = allowedLayers[layer]
    if (!layers) return {}

    function check(node, source) {
      if (!source) return
      if (source.type !== 'Literal' || typeof source.value !== 'string') {
        context.report({ node, messageId: 'dynamic' })
        return
      }
      const dependency = source.value
      let allowed
      if (
        dependency.startsWith('.') ||
        dependency.startsWith('@/') ||
        path.isAbsolute(dependency)
      ) {
        const target = dependency.startsWith('@/')
          ? path.resolve(sourceRoot, dependency.slice(2))
          : path.resolve(path.dirname(filename), dependency)
        const [area, targetFeature, targetLayer] = path.relative(sourceRoot, target).split(path.sep)
        allowed = area === 'features' && layers.includes(targetLayer)
        if (layer === 'presentation') {
          allowed ||= area === 'components' || area === 'lib'
          allowed ||= area === 'features' && targetFeature === feature && target.endsWith('.css')
        }
        if (layer === 'adapters') allowed ||= ['api', 'lib', 'integrations'].includes(area)
      } else {
        allowed =
          layer === 'adapters' ||
          (layer === 'presentation' &&
            viewPackages.some((name) => dependency === name || dependency.startsWith(`${name}/`)))
      }
      if (!allowed) context.report({ node, messageId: 'boundary', data: { layer, dependency } })
    }

    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
      TSImportType: (node) => check(node, node.argument),
      TSExternalModuleReference: (node) => check(node, node.expression),
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          check(node, node.arguments[0])
        }
      },
    }
  },
}
