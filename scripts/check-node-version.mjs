#!/usr/bin/env node

const minMajor = 22
const minMinor = 12
const [major, minor] = process.versions.node.split('.').map(Number)

if (major < minMajor || (major === minMajor && minor < minMinor)) {
  console.error(
    `\nTabPilot requires Node ${minMajor}.${minMinor}+. Detected Node ${process.versions.node}.\n` +
      `Please upgrade Node.js or use nvm: nvm install ${minMajor}\n`
  )
  process.exit(1)
} else if (major > minMajor) {
  console.warn(
    `\n[TabPilot] Warning: Detected Node ${process.versions.node}. This version is newer than the base recommendation (Node 22.x).\n` +
      'Installation will proceed — native bindings will be auto-repaired if needed.\n'
  )
}
