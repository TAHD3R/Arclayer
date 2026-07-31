export const ROOT_HELP = `Arclayer CLI

Usage:
  arclayer <command> <subcommand> [options]

Commands:
  content export   Export project content transfer bundle
  content import   Import project content transfer bundle
  generate         Run code generators

Run arclayer <command> --help for command-specific options.
`;

export const CONTENT_HELP = `Arclayer content transfer commands

Usage:
  arclayer content export --api-url <url> --token <token> --workspace-id <id> --project-id <id> --site-id <id> --out <file>
  arclayer content import --api-url <url> --token <token> --workspace-id <id> --project-id <id> --site-id <id> --file <file>

Content transfer commands require backend transfer routes exposed through OpenAPI.
`;

export const GENERATE_HELP = `Arclayer generator commands

Usage:
  arclayer generate <target> [options]

Generator contracts are reserved for a follow-up task.
`;
