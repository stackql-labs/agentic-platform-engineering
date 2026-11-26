import { connect } from './stackql.ts';
const server = await connect('safe', '');
try { console.log(await server.install()); } finally { await server.close(); }
