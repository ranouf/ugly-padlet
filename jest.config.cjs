module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/jest/**/*.test.js"],
  collectCoverageFrom: ["scripts/extension-metadata.cjs"],
  coverageDirectory: "coverage/jest",
  coverageReporters: ["text", "lcov", "json-summary", "cobertura"],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  reporters: ["default", ["jest-junit", { outputDirectory: "test-results/jest", outputName: "junit.xml" }]],
};
