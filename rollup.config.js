import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { readFileSync } from 'fs'

// Read package.json using fs instead of import
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

export default {
  input: 'src/index.ts',
  external: [
    'react',
    'react-dom',
    'sanity',
    '@sanity/ui',
    '@sanity/icons',
    'groq'
  ],
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    {
      file: pkg.module,
      format: 'esm',
      sourcemap: true
    }
  ],
  plugins: [
    resolve({
      browser: true
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist',
      rootDir: 'src'
    })
  ]
}
