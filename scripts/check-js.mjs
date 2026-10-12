#!/usr/bin/env node
/**
 * 小程序静态检查（零依赖，只用 Node 内置模块）
 *
 * 1. 对 src/miniapp 下所有 .js 做语法检查
 * 2. 对 src/miniapp 下所有 .json 做解析检查
 *
 * 只解析、不执行，所以不需要微信小程序运行时（wx / App / Page 这些全局对象）。
 * 用法：npm run lint
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scanRoot = join(repoRoot, 'src', 'miniapp');
const IGNORED_DIRS = new Set(['node_modules', 'miniprogram_npm', '.git']);

/** 递归收集指定后缀的文件 */
function collect(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      collect(full, exts, out);
    } else if (entry.isFile() && exts.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];
let checkedJs = 0;
let checkedJson = 0;

for (const file of collect(scanRoot, new Set(['.js']))) {
  const rel = relative(repoRoot, file).replace(/\\/g, '/');
  try {
    // 只做语法解析，不会执行文件内容
    new vm.Script(readFileSync(file, 'utf8'), { filename: rel });
    checkedJs += 1;
  } catch (err) {
    failures.push(`${rel}: ${err.message}`);
  }
}

for (const file of collect(scanRoot, new Set(['.json']))) {
  const rel = relative(repoRoot, file).replace(/\\/g, '/');
  try {
    JSON.parse(readFileSync(file, 'utf8'));
    checkedJson += 1;
  } catch (err) {
    failures.push(`${rel}: ${err.message}`);
  }
}

// 顺手校验仓库根目录的 JSON 配置
for (const name of ['package.json']) {
  const file = join(repoRoot, name);
  try {
    if (statSync(file).isFile()) {
      JSON.parse(readFileSync(file, 'utf8'));
      checkedJson += 1;
    }
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

if (failures.length > 0) {
  console.error(`✗ 检查未通过，共 ${failures.length} 个问题：`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`✓ 小程序静态检查通过（${checkedJs} 个 JS、${checkedJson} 个 JSON）`);
