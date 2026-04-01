import {Command} from '@oclif/core'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'

import {registerAllTools} from '../../lib/mcp/server.js'

export default class Mcp extends Command {
  static description = 'Start an MCP server over stdio'
  static examples = ['<%= config.bin %> mcp']

  async run(): Promise<void> {
    const server = new McpServer({name: 'adapty-mcp', version: this.config.version})
    registerAllTools(server, this.config)
    const transport = new StdioServerTransport()
    await server.connect(transport)
    process.stderr.write('Adapty MCP server running on stdio\n')
    // Keep alive — the stdio transport holds the connection
    await new Promise<void>(() => {})
  }
}
