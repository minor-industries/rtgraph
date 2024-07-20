import {build} from 'esbuild';

build({
    entryPoints: ['./dist/rtgraph.js'],
    bundle: true,
    outfile: './dist/rtgraph.min.js',
    format: 'esm',
    minify: true
}).catch(() => process.exit(1));
