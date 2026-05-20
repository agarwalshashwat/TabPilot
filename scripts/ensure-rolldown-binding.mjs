#!/usr/bin/env node

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

if (process.env.TABPILOT_SKIP_BINDING_FIX === '1') {
  process.exit(0)
}

const require = createRequire(import.meta.url)
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

ensureRolldownBinding()
ensureLightningcssBinding()

function ensureRolldownBinding() {
  const platformCpuToPkg = {
    'darwin-arm64': '@rolldown/binding-darwin-arm64',
    'darwin-x64': '@rolldown/binding-darwin-x64',
    'linux-x64': '@rolldown/binding-linux-x64-gnu',
    'linux-arm64': '@rolldown/binding-linux-arm64-gnu',
    'win32-x64': '@rolldown/binding-win32-x64-msvc',
    'win32-arm64': '@rolldown/binding-win32-arm64-msvc',
  }

  const pkgName = platformCpuToPkg[`${process.platform}-${process.arch}`]
  if (!pkgName) return

  const rolldownPkg = readJson(join(process.cwd(), 'node_modules', 'rolldown', 'package.json'))
  const expectedVersion = rolldownPkg?.optionalDependencies?.[pkgName]
  if (!expectedVersion) return

  const bindingDir = join(process.cwd(), 'node_modules', pkgName)
  const bindingPkg = readJson(join(bindingDir, 'package.json'))
  const entry = bindingPkg?.main
  if (!entry) return

  const binaryPath = join(bindingDir, entry)
  if (existsSync(binaryPath)) return

  repairWithInstallAndPack({
    label: 'rolldown',
    packageWithVersion: `${pkgName}@${expectedVersion}`,
    expectedBinaryPath: binaryPath,
    extractTargetDir: bindingDir,
    archiveEntry: `package/${entry}`,
  })
}

function ensureLightningcssBinding() {
  const parts = [process.platform, process.arch]
  if (process.platform === 'linux') {
    const family = detectLibcFamilySync()
    if (family === 'musl') parts.push('musl')
    else if (process.arch === 'arm') parts.push('gnueabihf')
    else parts.push('gnu')
  } else if (process.platform === 'win32') {
    parts.push('msvc')
  }

  const suffix = parts.join('-')
  const pkgName = `lightningcss-${suffix}`

  const lightningPkg = readJson(join(process.cwd(), 'node_modules', 'lightningcss', 'package.json'))
  const expectedVersion = lightningPkg?.optionalDependencies?.[pkgName]
  if (!expectedVersion) return

  const platformPkg = readJson(join(process.cwd(), 'node_modules', pkgName, 'package.json'))
  const platformEntry = platformPkg?.main ?? `lightningcss.${suffix}.node`
  const platformBinaryPath = join(process.cwd(), 'node_modules', pkgName, platformEntry)

  // lightningcss loader first requires lightningcss-<platform>, then falls back
  // to ../lightningcss.<platform>.node from lightningcss/node/index.js.
  const fallbackBinaryPath = join(
    process.cwd(),
    'node_modules',
    'lightningcss',
    `lightningcss.${suffix}.node`
  )
  if (existsSync(platformBinaryPath) || existsSync(fallbackBinaryPath)) return

  repairWithInstallAndPack({
    label: 'lightningcss',
    packageWithVersion: `${pkgName}@${expectedVersion}`,
    expectedBinaryPath: fallbackBinaryPath,
    extractTargetDir: join(process.cwd(), 'node_modules', 'lightningcss'),
    archiveEntry: `package/${platformEntry}`,
  })
}

function repairWithInstallAndPack({
  label,
  packageWithVersion,
  expectedBinaryPath,
  extractTargetDir,
  archiveEntry,
}) {
  console.warn(
    `[postinstall] Missing ${label} native binding. Installing ${packageWithVersion} ...`
  )

  const installed = spawnSync(npmCmd, ['install', '--no-save', packageWithVersion], {
    stdio: 'inherit',
    env: { ...process.env, TABPILOT_SKIP_BINDING_FIX: '1' },
  })

  if (existsSync(expectedBinaryPath)) return

  const packed = spawnSync(npmCmd, ['pack', packageWithVersion, '--silent'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, TABPILOT_SKIP_BINDING_FIX: '1' },
    encoding: 'utf8',
  })

  const tarball = (packed.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1)

  if (packed.status === 0 && tarball && process.platform !== 'win32') {
    const extracted = spawnSync(
      'tar',
      ['-xzf', tarball, '--strip-components', '1', '-C', extractTargetDir, archiveEntry],
      { stdio: 'inherit' }
    )
    try {
      rmSync(tarball)
    } catch {
      // Ignore temp cleanup failures.
    }
    if (extracted.status === 0 && existsSync(expectedBinaryPath)) return
  }

  if (installed.status !== 0 || !existsSync(expectedBinaryPath)) {
    console.warn(
      `[postinstall] Could not auto-repair ${packageWithVersion}. If build fails, run: npm pack ${packageWithVersion} and extract ${archiveEntry} into ${extractTargetDir}.`
    )
  }
}

function detectLibcFamilySync() {
  try {
    const { familySync, MUSL } = require('detect-libc')
    return familySync() === MUSL ? 'musl' : 'glibc'
  } catch {
    return 'glibc'
  }
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
