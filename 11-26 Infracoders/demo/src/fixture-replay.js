import { readFileSync } from 'node:fs';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/deployment-context.json', import.meta.url), 'utf8'),
);

console.log(fixture.label);
console.log(JSON.stringify(fixture, null, 2));
console.log('This is synthetic context, not a live StackQL MCP query.');
