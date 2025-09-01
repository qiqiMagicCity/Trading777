/** @type {import('jest').Config} */
module.exports = {
  // 在仓库根运行 jest 时，委托到子项目
  projects: ["<rootDir>/apps/web"],
};
