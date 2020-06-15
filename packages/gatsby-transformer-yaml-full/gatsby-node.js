const isPlainObject = require(`is-plain-object`)
const jsYaml = require(`js-yaml`)
const path = require(`path`)

const self = require('./')

const CAMEL_CASE_REGEXP = /(?:^|[^a-z0-9]+)([a-z0-9])|[^a-z0-9]+$/g

function camelCase(string) {
  return string.toLowerCase().replace(CAMEL_CASE_REGEXP, (_, char) => {
    return char !== undefined ? char.toUpperCase() : ''
  })
}

exports.onCreateNode = async (helpers, { plugins }) => {
  const { node } = helpers

  if (node.internal.mediaType !== `text/yaml`) {
    return
  }

  const {
    actions: { createNode, createParentChildLink },
    createContentDigest,
    createNodeId,
    loadNodeContent
  } = helpers

  function linkNodes({ id, ...content }, parent, { type = '', index = 0 }) {
    const options = getPluginOptions()
    const overrideType = options.defaultSchema != '' ? `${options.defaultSchema} Yaml` : `${type} Yaml`
    const node = {
      ...content,
      id: id ? id : createNodeId(`${parent.id}:${index} >>> YAML`),
      children: [],
      parent: parent.id
    }

    node.internal = {
      contentDigest: createContentDigest(node),
      type: camelCase(overrideType)
    }

    createNode(node)
    createParentChildLink({ parent, child: node })
  }

  async function resolveContent(content) {
    if (content === Promise.resolve(content)) {
      content = await Promise.resolve(content)
    }

    let entries

    if (Array.isArray(content)) {
      entries = content.entries()
    } else if (
      isPlainObject(content) &&
      !(content.internal && content.internal.type)
    ) {
      entries = Object.entries(content)
    } else {
      return content
    }

    for (let [key, value] of entries) {
      content[key] = await resolveContent(value)
    }

    return content
  }

  const types = []

  for (let { resolve, pluginOptions } of plugins) {
    const plugin = require(resolve)
    const { options, tag } = plugin(helpers, pluginOptions)
    types.push(new jsYaml.Type(tag, options))
  }

  self.configureSchema(types)

  const nodeContent = (await loadNodeContent(node)) + '\n'
  const parsedContent = self.parse(nodeContent)

  if (Array.isArray(parsedContent)) {
    for (let [index, content] of parsedContent.entries()) {
      if (!isPlainObject(content)) continue
      const type = `${node.relativeDirectory} ${node.name}`
      const resolvedContent = await resolveContent(content)
      linkNodes(resolvedContent, node, { type, index })
    }
  } else if (isPlainObject(parsedContent)) {
    const type = path.basename(node.dir)
    const resolvedContent = await resolveContent(parsedContent)
    linkNodes(resolvedContent, node, { type })
  }
}

const pluginDefaults = {
  defaultSchema: '',
}

let pluginOptions = Object.assign({}, pluginDefaults)
function setPluginOptions(opts) {
  pluginOptions = Object.assign({}, pluginOptions, opts)

  return pluginOptions
}

function getPluginOptions () {
  return pluginOptions
}


exports.onPreInit = (_, pluginOptions) => {
  setPluginOptions(pluginOptions)
}
