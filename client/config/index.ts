import { defineConfig } from '@tarojs/cli'
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { brand } from '../src/config/brand'
import { version } from '../package.json'

const outputRoot = process.env.TARO_ENV === 'h5' ? 'dist/h5' : 'dist/weapp'
const useCI = process.argv.some(arg => arg === '--upload' || arg === '--preview')
const clientRoot = resolve(__dirname, '..')
// Read upload-only settings in Node, never expose private-key paths to the client bundle.
if (useCI && existsSync(resolve(clientRoot, '.env.local'))) {
  require('node:process').loadEnvFile(resolve(clientRoot, '.env.local'))
}
let privateKeyPath = process.env.MINIPROGRAM_PRIVATE_KEY_PATH || ''
if (useCI) {
  if (!/^wx[0-9a-f]{16}$/.test(process.env.TARO_APP_ID || '') || !privateKeyPath) {
    throw new Error('Set TARO_APP_ID and MINIPROGRAM_PRIVATE_KEY_PATH in client/.env.local before preview or upload.')
  }
  privateKeyPath = realpathSync(resolve(clientRoot, privateKeyPath))
  for (const directory of ['src', 'dist']) {
    const fromBundle = relative(resolve(clientRoot, directory), privateKeyPath)
    if (fromBundle !== '..' && !fromBundle.startsWith('../') && !fromBundle.startsWith('..\\') && !isAbsolute(fromBundle)) {
      throw new Error('Keep the upload private key outside client/src and client/dist; use client/.secrets/ or an external directory.')
    }
  }
}

export default defineConfig<'webpack5'>({
  projectName: 'zdog-xiaoman', date: '2026-10-04',
  designWidth: 375, deviceRatio: { 375: 2, 640: 1.17, 750: 1, 828: 0.905 },
  sourceRoot: 'src', outputRoot,
  framework: 'react', compiler: 'webpack5', cache: { enable: false },
  plugins: useCI ? [[
    '@tarojs/plugin-mini-ci',
    {
      weapp: {
        appid: process.env.TARO_APP_ID, privateKeyPath,
        ignores: ['**/*.map', '**/.env*', '**/*.pem', '**/*.key', '**/.secrets/**'],
      },
      version: process.env.MINIPROGRAM_VERSION || version,
      desc: process.env.MINIPROGRAM_DESCRIPTION || 'Xiaoman baby supplies companion',
    },
  ]] : [],
  // Define the public endpoint even when unset; browsers and mini-programs have no Node process.
  env: { TARO_APP_API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE_URL || '') },
  copy: { patterns: [{ from: 'src/assets', to: `${outputRoot}/assets` }], options: {} },
  mini: { postcss: { pxtransform: { enable: true, config: {} }, cssModules: { enable: false } } },
  h5: {
    htmlPluginOption: { title: `${brand.name} · ${brand.description}` }, publicPath: '/',
    staticDirectory: 'static', router: { mode: 'hash' },
    output: { filename: 'js/[name].[contenthash:8].js', chunkFilename: 'js/[name].[contenthash:8].js' },
    miniCssExtractPluginOption: {
      ignoreOrder: true, filename: 'css/[name].[contenthash:8].css',
      chunkFilename: 'css/[name].[contenthash:8].css',
    },
    devServer: { host: '127.0.0.1', port: 10087, proxy: [{ context: ['/api'], target: 'http://127.0.0.1:8083' }] },
  },
})
