const path = require('path');
const root = path.resolve(__dirname, '..', '..');
require(path.join(root, 'node_modules', 'ts-node', 'register', 'transpile-only'));
require(path.join(root, 'src', 'main', 'main.ts'));
