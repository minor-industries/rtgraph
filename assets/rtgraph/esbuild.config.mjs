import {build} from 'esbuild';

build({
    entryPoints: ['./dist/index.js'],
    bundle: true,
    outfile: './dist/rtgraph.js',
    format: 'esm',
    minify: false
}).catch(() => process.exit(1));


build({
    entryPoints: ['./dist/index.js'],
    bundle: true,
    outfile: './dist/rtgraph.min.js',
    format: 'esm',
    minify: true
}).catch(() => process.exit(1));
