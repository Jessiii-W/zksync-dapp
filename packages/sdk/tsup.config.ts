// packages/sdk/tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"], // 入口文件
  outDir: "dist", // 输出目录
  format: ["esm", "cjs"], // 同时输出ESModule和CJS
  dts: true, // 生成类型声明
  clean: true, // 打包前清理dist
  sourcemap: true, // 生成sourcemap，方便调试
  // 将 Node.js 模块标记为 external，避免在浏览器构建中被打包
  external: ["fs", "path", "url"],
  // 不打包 Node.js 内置模块
  noExternal: [],
});
