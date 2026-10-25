export function requireExactFlag(args: string[], expected: string, usage: string): void {
  if (args.length !== 1 || args[0] !== expected) throw new Error(usage);
}
